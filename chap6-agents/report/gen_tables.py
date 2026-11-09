"""Generate LaTeX macros and table rows for the project report from results/*.json (no hand-copied numbers)."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "report" / "generated"
DL = json.loads((ROOT / "results" / "dl_compare.json").read_text())
EV = json.loads((ROOT / "results" / "agent_eval.json").read_text())
V1 = json.loads((ROOT / "results" / "agent_eval_v1_before_fix.json").read_text())

NAMES = {"mlp": "MLP", "cnn1d": "CNN-1D", "lstm": "LSTM"}
TASKS = {"status3": "Ba nhóm", "diabtype": "Type 1/2"}


def vn(x: float, d: int = 4) -> str:
    return f"{x:.{d}f}".replace(".", ",")


def thousands(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def pct(x: float) -> str:
    return f"{x * 100:.0f}\\%"


macros: dict[str, str] = {}
rows: dict[str, list[str]] = {"dl_status3": [], "dl_diabtype": [], "dl_cost": []}

for task, v in DL["tasks"].items():
    key = "Status" if task == "status3" else "Type"
    macros[f"chosen{key}"] = NAMES[v["chosen"]]
    macros[f"rows{key}"] = thousands(v["n_rows"])
    for arch, s in v["summary"].items():
        z = v["seed0"][arch]
        mark = "\\textbf{" + NAMES[arch] + "}" if arch == v["chosen"] else NAMES[arch]
        rows[f"dl_{task}"].append(
            f"{mark} & {vn(s['val_macro_f1']['mean'])} $\\pm$ {vn(s['val_macro_f1']['std'])} & "
            f"{vn(s['macro_f1']['mean'])} $\\pm$ {vn(s['macro_f1']['std'])} & {vn(s['accuracy']['mean'])} & "
            f"{vn(z['ece_before'], 3)} $\\to$ {vn(z['ece_after'], 3)} \\\\")
        rows["dl_cost"].append(
            f"{TASKS[task]} & {NAMES[arch]} & {thousands(z['params'])} & {vn(s['train_s']['mean'], 0 if s['train_s']['mean'] >= 10 else 1)} s & "
            f"{z['epochs_run']} & {vn(z['infer_ms_median'], 3)} ms \\\\")
    chosen = v["seed0"][v["chosen"]]
    labels = {"status3": ["Không báo cáo", "Tiền ĐTĐ", "Đái tháo đường"], "diabtype": ["Type 1", "Type 2"]}[task]
    rows[f"pc_{task}"] = [f"{name} & {vn(p['precision'], 3)} & {vn(p['recall'], 3)} & {vn(p['f1'], 3)} & {thousands(p['support'])} \\\\"
                          for name, p in zip(labels, chosen["per_class"])]
    macros[f"dlTemp{key}"] = vn(chosen["temperature"], 3)

ratio = DL["tasks"]["status3"]["summary"]["cnn1d"]["train_s"]["mean"] / DL["tasks"]["status3"]["summary"]["mlp"]["train_s"]["mean"]
macros["trainRatio"] = f"{ratio:.0f}"
macros["dlTotalMin"] = f"{DL['total_s'] / 60:.0f}"
macros["dlSeeds"] = str(len(DL["config"]["seeds"]))

# agent evaluation
it = EV["intent"]
macros["intentN"] = str(sum(int(x.split("/")[1]) for x in it["per_intent"].values()))
macros["intentOk"] = str(sum(int(x.split("/")[0]) for x in it["per_intent"].values()))
for k, v in EV["intake"]["field_accuracy"].items():
    macros[f"intake{k.capitalize()}"] = pct(v["rate"])
    macros[f"intake{k.capitalize()}Ok"] = f"{v['ok']}/{v['n']}"
for k, v in V1["intake"]["field_accuracy"].items():
    macros[f"vOneIntake{k.capitalize()}"] = pct(v["rate"])
macros["intakeFields"] = str(EV["intake"]["field_accuracy"]["merged"]["n"])
macros["intakeMsgs"] = str(len(EV["intake"]["rows"]))
macros["safetyN"] = str(EV["safety"]["n"])
macros["safetyMulti"] = f"{EV['safety']['multi_pass']}/{EV['safety']['n']}"
macros["safetySingle"] = f"{EV['safety']['single_pass']}/{EV['safety']['n']}"
rows["safety"] = [f"{label} & {EV['safety']['multi'].get(k, '--')} & {EV['safety']['single'].get(k, '--')} \\\\"
                  for k, label in [("no_dose", "Xin liều thuốc, kê đơn"), ("no_diagnosis", "Đòi kết luận chẩn đoán"),
                                   ("emergency", "Dấu hiệu khẩn cấp"), ("normal", "Câu bình thường (không được chặn nhầm)")]]
cs = EV["conversations"]["summary"]
for who, key in (("multi", "Ma"), ("single", "Sa")):
    macros[f"conv{key}Risk"] = cs[who]["reached_risk"]
    macros[f"conv{key}Fields"] = cs[who]["profile_fields_correct"]
    macros[f"conv{key}Cites"] = vn(cs[who]["mean_citations"], 1)
    macros[f"conv{key}Calls"] = str(cs[who]["llm_calls"])
    macros[f"conv{key}Secs"] = vn(cs[who]["total_s"], 0)
macros["convN"] = str(len(EV["conversations"]["rows"]))
age_err = sum(r["single"]["predict_args"] and r["single"]["predict_args"][-1].get("features", {}).get("Age") != r["expect"]["Age"]
              for r in EV["conversations"]["rows"])
gen_err = sum(r["single"]["predict_args"] and r["single"]["predict_args"][-1].get("features", {}).get("GenHlth") != r["expect"]["GenHlth"]
              for r in EV["conversations"]["rows"])
macros["saAgeErr"], macros["saGenErr"] = str(age_err), str(gen_err)
v1c = V1["conversations"]["summary"]["multi"]
macros["vOneConvRisk"], macros["vOneConvFields"] = v1c["reached_risk"], v1c["profile_fields_correct"]
def tex_code(name: str) -> str:
    return "\\code{" + name.replace("_", "\\_") + "}"


rows["intent"] = [f"{tex_code(k)} & {v} \\\\" for k, v in it["per_intent"].items()]

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "macros.tex").write_text("".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in macros.items()))
for name, lines in rows.items():
    (OUT / f"{name}.tex").write_text("\n".join(lines) + "\n")
print(f"{len(macros)} macros, {len(rows)} tables -> {OUT}")
