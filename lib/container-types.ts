// Rail container sizes for the "Контейнер ЖД доставки" feature (see
// ContainerShipment in prisma/schema.prisma) — shared between the manager
// dialog (client component) and the API route/PDF (server), same pattern as
// lib/destination-countries.ts.
const CONTAINER_TYPES = [
  { value: "ft20", label: "20 футов" },
  { value: "ft40", label: "40 футов" },
] as const;

type ContainerType = (typeof CONTAINER_TYPES)[number]["value"];

function containerTypeLabel(value: string): string {
  return CONTAINER_TYPES.find((c) => c.value === value)?.label ?? value;
}

export { CONTAINER_TYPES, containerTypeLabel };
export type { ContainerType };
