/**
 * I badge che l'elenco, la scheda e il catalogo mostrano più volte: lo
 * stato dell'attrezzatura e i due flag del tipo. Componenti server.
 */
import { Badge } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "./labels";

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <Badge tone={EQUIPMENT_STATUS_TONE[status]}>{EQUIPMENT_STATUS_LABELS[status]}</Badge>;
}

/** Il tipo è `mission_critical`: se è guasta o scaduta, il mezzo che la richiede non esce. */
export function MissionBadge() {
  return (
    <Badge tone="danger">
      <span title="Se è guasta o scaduta, il mezzo che la richiede in dotazione non può uscire">
        indispensabile
      </span>
    </Badge>
  );
}

/** Dispositivo elettromedicale: soggetto a verifica di sicurezza elettrica. */
export function ElectromedicalBadge() {
  return (
    <Badge tone="neutral">
      <span title="Soggetto a verifica di sicurezza elettrica (CEI EN 62353)">elettromedicale</span>
    </Badge>
  );
}
