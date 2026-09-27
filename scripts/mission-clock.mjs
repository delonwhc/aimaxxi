export function sevenPacificDaysAfter(iso) {
 const start=new Date(iso);if(!Number.isFinite(start.getTime()))throw new Error('Invalid opening time');
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const local=(date)=>{const p=Object.fromEntries(fmt.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)};
 const target=local(start)+7*86400000;let instant=start.getTime()+7*86400000;
 for(let n=0;n<3;n++)instant+=target-local(new Date(instant));return new Date(instant).toISOString();
}
