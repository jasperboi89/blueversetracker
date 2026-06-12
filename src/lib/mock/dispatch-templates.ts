export interface ReasonTemplate {
  id: string;
  text: string;
  type: "routine" | "urgent" | "na" | "unsure";
  expectedFlow: string;
}

export const globalReasonTemplates: ReasonTemplate[] = [
  { id: "gt-1", text: "After-hours appointment request", type: "routine", expectedFlow: "Greeting → reason → take message → save." },
  { id: "gt-2", text: "Prescription refill request", type: "routine", expectedFlow: "Greeting → confirm caller → take refill details → save." },
  { id: "gt-3", text: "Urgent — chest pain callback", type: "urgent", expectedFlow: "Urgent script → on-call lookup → page provider immediately." },
  { id: "gt-4", text: "Urgent — pediatric fever after hours", type: "urgent", expectedFlow: "Urgent script → on-call lookup → page pediatric on-call." },
  { id: "gt-5", text: "General question / non-urgent", type: "routine", expectedFlow: "Greeting → take message → save for next business day." },
];

export const accountReasonTemplates: Record<string, ReasonTemplate[]> = {
  "1042": [
    { id: "rb-1", text: "Riverbend on-call rotation page", type: "urgent", expectedFlow: "Page rotation provider per overnight grid." },
    { id: "rb-2", text: "Riverbend appointment request", type: "routine", expectedFlow: "Take appointment request, save for scheduler." },
  ],
  "2188": [
    { id: "np-1", text: "Northstar — sick child callback", type: "urgent", expectedFlow: "Page pediatric on-call within 5 minutes." },
  ],
  "6610": [
    { id: "lc-1", text: "Lakeside — chest pain", type: "urgent", expectedFlow: "Page cardiology on-call immediately." },
  ],
};