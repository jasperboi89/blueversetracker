export interface MockAccount {
  number: string;
  name: string;
  status: "active" | "archived" | "off-service";
}
export const mockAccounts: MockAccount[] = [
  { number: "1042", name: "Riverbend Family Clinic", status: "active" },
  { number: "2188", name: "Northstar Pediatrics", status: "active" },
  { number: "3401", name: "Harbor Dental Group", status: "active" },
  { number: "4821", name: "Cedar Oaks Veterinary", status: "active" },
  { number: "5093", name: "Summit Orthopedics", status: "active" },
  { number: "6610", name: "Lakeside Cardiology", status: "active" },
  { number: "7721", name: "Willowbrook OB-GYN", status: "archived" },
  { number: "8045", name: "Ironwood HVAC Services", status: "off-service" },
];