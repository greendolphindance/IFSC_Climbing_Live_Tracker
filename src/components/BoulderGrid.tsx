import type { BoulderResult } from "../../server/src/types/domain";

interface Props {
  boulders: BoulderResult[];
  currentBoulder?: number;
}

export function BoulderGrid({ boulders, currentBoulder }: Props) {
  return (
    <div className="boulder-grid" aria-label="Boulder progress">
      {boulders.map((boulder) => {
        const label = boulder.hasTop ? `T${boulder.attemptsToTop ?? ""}` : boulder.hasZone ? `Z${boulder.attemptsToZone ?? ""}` : " ";
        return (
          <div className={`boulder-cell ${boulder.hasTop ? "top" : boulder.hasZone ? "zone" : ""} ${currentBoulder === boulder.boulderNo ? "current" : ""}`} key={boulder.boulderNo}>
            <span>B{boulder.boulderNo}</span>
            <strong>{label}</strong>
          </div>
        );
      })}
    </div>
  );
}
