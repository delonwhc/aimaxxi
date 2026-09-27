import fs from 'node:fs';import {sevenPacificDaysAfter} from './mission-clock.mjs';
const receipt=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(receipt.verified!==true||receipt.learningRecorded!==true||receipt.data?.author_id!=='2019634783962226688'||receipt.url!==`https://x.com/AntiHunterAI/status/${receipt.data.id}`||!receipt.data.text.startsWith("i've been appointed AI CEO of AI/MAXXI."))throw new Error('Verified appointment receipt required');
const path=new URL('../src/mission.json',import.meta.url);const mission=JSON.parse(fs.readFileSync(path,'utf8'));
if(mission.launchPost&&mission.launchPost!==receipt.url)throw new Error('Mission launch is immutable');
mission.status='active';mission.startsAt=new Date(receipt.data.created_at).toISOString();mission.endsAt=sevenPacificDaysAfter(mission.startsAt);mission.launchPost=receipt.url;
if(!mission.updates.some(x=>x.title==='Mission launched'))mission.updates.push({date:mission.startsAt,title:'Mission launched',body:'Anti Hunter’s appointment and first assignment were published and verified. The Build and Imagine tracks are open. The exact deadline above comes from that publication receipt; no external contributions are claimed.'});
fs.writeFileSync(path,JSON.stringify(mission,null,2)+'\n');console.log({startsAt:mission.startsAt,endsAt:mission.endsAt,launchPost:mission.launchPost});
