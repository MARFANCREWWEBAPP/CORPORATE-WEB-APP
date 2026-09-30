
'use strict';
function responseDue(settings,sentAt) {
  const days=settings.workflowRules?.BUDGET_SENT?.days ?? settings.budgetResponseDays ?? 4;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(sentAt));
  const date=new Date(today+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
module.exports={responseDue};
