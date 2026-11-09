"""Build data/survey.db from BRFSS 2015 (Kaggle CSV) and BRFSS 2023 (CDC XPT), both on the 2015 coding."""

import shutil
import sqlite3
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadstat

from backend.app.classify import FEATURE_NAMES, FIELDS
from backend.app.schema import LABEL_NAMES, Task

ROOT = Path(__file__).resolve().parents[1]
BRFSS_DIR = ROOT / "data" / "brfss"
DB_PATH = ROOT / "data" / "survey.db"
CSV_2015 = BRFSS_DIR / "diabetes_012_health_indicators_BRFSS2015.csv"
CSV_2015_SOURCE = ROOT.parents[1] / "ass_04" / "A4_02_TranXuanThanh_280" / "data" / CSV_2015.name
XPT_2023 = BRFSS_DIR / "LLCP2023.XPT"
XPT_URL = "https://www.cdc.gov/brfss/annual_data/2023/files/LLCP2023XPT.zip"

NAN = float("nan")
YES_NO = {1: 1, 2: 0}
NO_YES = {1: 0, 2: 1}


@dataclass(frozen=True)
class Recode:
    """Raw 2023 column -> 2015 convention. Categorical: codes not listed become NaN. Numeric: raw*scale, codes override."""

    source: str
    codes: dict[int, float] = field(default_factory=dict)
    numeric: bool = False
    scale: float = 1.0

    def apply(self, raw: pd.DataFrame) -> pd.Series:
        s = raw[self.source].astype(float)
        out = s * self.scale if self.numeric else pd.Series(NAN, index=s.index)
        for code, value in self.codes.items():
            out[s == code] = value
        return out


# Fruits and Veggies are absent: LLCP2023.XPT has no fruit or vegetable item or derived variable.
# INCOME3 has 11 levels, INCOME2 (2015) had 8. Levels 8-11 (>= 75k USD) collapse to 8.
RECODE_2023: dict[str, Recode] = {
    "HighBP": Recode("_RFHYPE6", NO_YES),
    "HighChol": Recode("_RFCHOL3", NO_YES),
    "CholCheck": Recode("_CHOLCH3", {1: 1, 2: 0, 3: 0}),
    "BMI": Recode("_BMI5", numeric=True, scale=0.01),
    "Smoker": Recode("SMOKE100", YES_NO),
    "Stroke": Recode("CVDSTRK3", YES_NO),
    "HeartDiseaseorAttack": Recode("_MICHD", YES_NO),
    "PhysActivity": Recode("_TOTINDA", YES_NO),
    "HvyAlcoholConsump": Recode("_RFDRHV8", NO_YES),
    "AnyHealthcare": Recode("_HLTHPL1", YES_NO),
    "NoDocbcCost": Recode("MEDCOST1", YES_NO),
    "GenHlth": Recode("GENHLTH", {i: i for i in range(1, 6)}),
    "MentHlth": Recode("MENTHLTH", {88: 0, 77: NAN, 99: NAN}, numeric=True),
    "PhysHlth": Recode("PHYSHLTH", {88: 0, 77: NAN, 99: NAN}, numeric=True),
    "DiffWalk": Recode("DIFFWALK", YES_NO),
    "Sex": Recode("_SEX", {1: 1, 2: 0}),
    "Age": Recode("_AGEG5YR", {i: i for i in range(1, 14)}),
    "Education": Recode("EDUCA", {i: i for i in range(1, 7)}),
    "Income": Recode("INCOME3", {**{i: i for i in range(1, 8)}, 8: 8, 9: 8, 10: 8, 11: 8}),
}
STATUS_FROM_DIABETE4 = {1: 2, 4: 1, 3: 0, 2: 0}
DIABTYPE_CODES = (1, 2)
RAW_2023 = sorted({r.source for r in RECODE_2023.values()} | {"DIABETE4", "DIABTYPE"})


def _json_value(v: float) -> float | None:
    return None if v != v else v


def describe_recode() -> dict:
    return {
        name: {"source": r.source, "numeric": r.numeric, "scale": r.scale, "codes": {str(k): _json_value(v) for k, v in r.codes.items()}}
        for name, r in RECODE_2023.items()
    } | {
        "HighChol_extra": "blank _RFCHOL3 with _CHOLCH3 == 3 (never checked) becomes 0",
        "Diabetes_012": {"source": "DIABETE4", "codes": {str(k): v for k, v in STATUS_FROM_DIABETE4.items()}, "dropped": "7, 9, blank"},
        "diabtype": "DIABETE4 == 1 and DIABTYPE in (1, 2); DIABETE4, DIABAGE4, INSULIN1, DIABTYPE are never features",
    }


def ensure_files() -> None:
    BRFSS_DIR.mkdir(parents=True, exist_ok=True)
    if not CSV_2015.exists():
        shutil.copy(CSV_2015_SOURCE, CSV_2015)
    if XPT_2023.exists():
        return
    archive = BRFSS_DIR / "LLCP2023XPT.zip"
    if not archive.exists():
        urllib.request.urlretrieve(XPT_URL, archive)
    with zipfile.ZipFile(archive) as z:
        member = next(n for n in z.namelist() if n.strip().upper().endswith(".XPT"))
        with z.open(member) as src, open(XPT_2023, "wb") as dst:
            shutil.copyfileobj(src, dst)


def load_2015() -> pd.DataFrame:
    raw = pd.read_csv(CSV_2015)
    df = raw[FEATURE_NAMES].copy()
    df["status3"] = raw["Diabetes_012"].astype(int)
    df["diabtype"] = np.nan
    return df


def load_2023() -> pd.DataFrame:
    raw, _ = pyreadstat.read_xport(str(XPT_2023), usecols=RAW_2023)
    df = pd.DataFrame({name: r.apply(raw) for name, r in RECODE_2023.items()})
    never_checked = raw["_CHOLCH3"].eq(3) & df["HighChol"].isna()
    df.loc[never_checked, "HighChol"] = 0
    df["status3"] = raw["DIABETE4"].map(STATUS_FROM_DIABETE4)
    df["diabtype"] = raw["DIABTYPE"].where(raw["DIABETE4"].eq(1) & raw["DIABTYPE"].isin(DIABTYPE_CODES))
    return df


def validate(df: pd.DataFrame, year: int) -> None:
    for f in FIELDS:
        bad = df[f["name"]].dropna()
        bad = bad[(bad < f["min"]) | (bad > f["max"])]
        assert bad.empty, f"{year} {f['name']} out of [{f['min']}, {f['max']}]: {bad.unique()[:5]}"


def records(df: pd.DataFrame, year: int, task: Task, rows: pd.Series) -> pd.DataFrame:
    sub = df.loc[rows]
    integer_cols = [c for c in FEATURE_NAMES if c != "BMI"]
    feats = sub[FEATURE_NAMES].astype({c: "Int64" for c in integer_cols})
    return pd.DataFrame({
        "record_id": [f"{year}-{i + 1:07d}" for i in sub.index],
        "year": year,
        "status": sub[task.value].astype(int).to_numpy(),
        "task": task.value,
        "features_json": feats.to_json(orient="records", lines=True).splitlines(),
    })


def build() -> dict:
    ensure_files()
    frames = {2015: load_2015(), 2023: load_2023()}
    for year, df in frames.items():
        validate(df, year)
    parts = []
    for year, df in frames.items():
        for task in Task:
            rows = df[task.value].notna()
            if rows.any():
                parts.append(records(df, year, task, rows))
    table = pd.concat(parts, ignore_index=True)
    definitions = pd.DataFrame(
        [(t.value, code, name) for (t, code), name in LABEL_NAMES.items()], columns=["task", "code", "label_vi"]
    )
    tmp = DB_PATH.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    with sqlite3.connect(tmp) as con:
        con.executescript(
            "CREATE TABLE survey_records (record_id TEXT NOT NULL, year INTEGER NOT NULL, status INTEGER NOT NULL,"
            " task TEXT NOT NULL, features_json TEXT NOT NULL, PRIMARY KEY (task, record_id));"
            "CREATE TABLE status_definitions (task TEXT NOT NULL, code INTEGER NOT NULL, label_vi TEXT NOT NULL,"
            " PRIMARY KEY (task, code));"
        )
        con.executemany("INSERT INTO survey_records VALUES (?,?,?,?,?)", table[["record_id", "year", "status", "task", "features_json"]].itertuples(index=False))
        con.executemany("INSERT INTO status_definitions VALUES (?,?,?)", definitions.itertuples(index=False))
        con.execute("CREATE INDEX idx_task_year_status ON survey_records (task, year, status)")
    tmp.replace(DB_PATH)
    return table.groupby(["task", "year", "status"]).size().to_dict()


if __name__ == "__main__":
    for key, n in build().items():
        print(key, n)
