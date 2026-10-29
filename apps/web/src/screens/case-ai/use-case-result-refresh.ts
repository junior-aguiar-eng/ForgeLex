import {useEffect,useRef,useState} from 'react';
export function createCaseResultRefresh(refresh:()=>Promise<void>,onPause:()=>void) {
  const deadline=Date.now()+600000;
  let stopped=false, running=false;
  const stop=()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener('forgelex:case-access-revoked',revoked);document.removeEventListener('visibilitychange',tick);};
  const revoked=()=>{stop();onPause();};
  const tick=async()=>{
    if(stopped)return;
    if(Date.now()>=deadline){stop();onPause();return;}
    if(running || document.visibilityState!=='visible')return;
    running=true;
    try{await refresh();}catch{stop();onPause();}finally{running=false;}
  };
  const timer=setInterval(()=>void tick(),30000);
  window.addEventListener('focus',tick);window.addEventListener('forgelex:case-access-revoked',revoked);document.addEventListener('visibilitychange',tick);
  return stop;
}
export function useCaseResultRefresh({enabled,scopeKey,refresh}:{enabled:boolean;scopeKey:string;refresh:()=>Promise<void>}) {
  const latest=useRef(refresh);latest.current=refresh;
  const [paused,setPaused]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{setPaused(false);if(!enabled)return;let live=true;const stop=createCaseResultRefresh(()=>latest.current(),()=>{if(live)setPaused(true);});return()=>{live=false;stop();};},[enabled,scopeKey,attempt]);
  return {waiting:enabled&&!paused,paused,retry:()=>{setAttempt(a=>a+1);void latest.current().catch(()=>setPaused(true));}};
}
