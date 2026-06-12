export interface MockTicket {
  number: string;
  subject: string;
  account: string;
  status: "working" | "waiting-cs" | "waiting-prog" | "completed";
}
export const mockTickets: MockTicket[] = [
  { number: "30182", subject: "Update on-call rotation", account: "Riverbend Family Clinic", status: "working" },
  { number: "30191", subject: "Add new dispatch contact", account: "Cedar Oaks Veterinary", status: "waiting-cs" },
  { number: "30205", subject: "Verify after-hours protocol", account: "Lakeside Cardiology", status: "waiting-prog" },
  { number: "30210", subject: "Holiday hours adjustment", account: "Harbor Dental Group", status: "completed" },
];