export const dueTodayItems = [
  { id: "d1", type: "Freshdesk Ticket", title: "Update on-call rotation", reference: "#30182" },
  { id: "d2", type: "Freshdesk Ticket", title: "Add new dispatch contact", reference: "#30191" },
];

export const openItemsList = [
  { id: "o1", type: "Freshdesk Ticket", title: "Update on-call rotation", reference: "#30182" },
  { id: "o2", type: "Additional Work", title: "Reviewing protocol changes", reference: "Riverbend Family Clinic" },
  { id: "o3", type: "Contact Dispatch", title: "Still working on ticket", reference: "Lakeside Cardiology" },
];

export const inReviewList = [
  { id: "r1", type: "Freshdesk Ticket", title: "Waiting on Customer Service", reference: "#30191" },
  { id: "r2", type: "Freshdesk Ticket", title: "Waiting on Programming", reference: "#30205" },
  { id: "r3", type: "Contact Dispatch", title: "Waiting on CS review", reference: "Harbor Dental Group" },
];

export const overviewCounts = {
  due: dueTodayItems.length,
  open: openItemsList.length,
  review: inReviewList.length,
};