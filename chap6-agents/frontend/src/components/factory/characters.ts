/**
 * The seven workers of the candy works, one per agent, built from primitives (original figures, working
 * names from the spec). Each has its own body shape and one prop that tells what the agent did:
 *
 * - Bác Gác Cổng (safety_in): short and barrel-wide under a tall dome helmet; blows the whistle and raises
 *   a no-entry paddle on an emergency.
 * - Cô Bẻ Ghi (orchestrator): cone skirt and two hair buns; throws a lever that turns the rail switch on her
 *   plinth to the exit the router chose; holds the rule book when the LLM is down.
 * - Chú Sổ Tay (intake): egg-shaped, round glasses, a big clipboard showing fields x/7.
 * - Cụ Cân Đong (risk): hunched elder with a candy-cane stick; his balance tips with the risk probability.
 * - Bé Đèn Pin (knowledge): small child with a miner's helmet; the headlamp lights and the child rides down
 *   into the chocolate cellar.
 * - Chị Pha Chế (advisor): tall hourglass figure with a high bun; pours from a jug into a glass.
 * - Ông Soát Vé (safety_out): tall and thin in a flat conductor's cap; stamps the ticket, a red crossed
 *   stamp when a dosage sentence was removed.
 *
 * Every rig faces +z; the scene turns it toward the camera. `update` allocates nothing per frame. The rigs
 * live in `characters-entry.ts` and `characters-work.ts`, shared parts and mood motion in `character-parts.ts`.
 */
import type { AgentId } from "@/lib/agents";
import type { CharacterRig } from "./character-parts";
import { GatekeeperRig, RecordKeeperRig, SwitchOperatorRig } from "./characters-entry";
import { ElderRig, InspectorRig, MinerRig, MixerRig } from "./characters-work";

export type { CharacterRig };

export function buildCharacter(id: AgentId): CharacterRig {
  const rig = {
    safety_in: () => new GatekeeperRig(),
    orchestrator: () => new SwitchOperatorRig(),
    intake: () => new RecordKeeperRig(),
    risk: () => new ElderRig(),
    knowledge: () => new MinerRig(),
    advisor: () => new MixerRig(),
    safety_out: () => new InspectorRig(),
  }[id]();
  rig.root.name = `character:${id}`;
  return rig;
}

export const isSwitchOperator = (rig: CharacterRig): rig is SwitchOperatorRig => rig instanceof SwitchOperatorRig;
export const isMiner = (rig: CharacterRig): rig is MinerRig => rig instanceof MinerRig;
