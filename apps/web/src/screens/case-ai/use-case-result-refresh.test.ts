import {afterEach,expect,it,vi} from 'vitest';
import {createCaseResultRefresh} from './use-case-result-refresh';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('pausa quando oculto, termina em dez minutos e limpa ao desmontar',async()=>{
 vi.useFakeTimers();
 const target=new EventTarget();
 vi.stubGlobal('window',target);
 const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 vi.stubGlobal('document',doc);
 const refresh=vi.fn().mockResolvedValue(undefined),paused=vi.fn();
 const stop=createCaseResultRefresh(refresh,paused);
 await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(1);
 doc.visibilityState='hidden';await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(1);
 doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(540000);expect(paused).toHaveBeenCalledOnce();
 const count=refresh.mock.calls.length;target.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(count);
 stop();expect(vi.getTimerCount()).toBe(0);
});
it('erro de acesso interrompe consultas e não repete falha indefinidamente',async()=>{
 vi.useFakeTimers();vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
 const refresh=vi.fn().mockRejectedValue(new Error('SESSION_REQUIRED')),paused=vi.fn();
 const stop=createCaseResultRefresh(refresh,paused);await vi.advanceTimersByTimeAsync(90000);
 expect(refresh).toHaveBeenCalledTimes(1);expect(paused).toHaveBeenCalledOnce();stop();
});

it('revogação interrompe a espera sem apagar os resultados já recebidos',async()=>{
 vi.useFakeTimers();const target=new EventTarget();vi.stubGlobal('window',target);vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
 const refresh=vi.fn().mockResolvedValue(undefined),paused=vi.fn();const stop=createCaseResultRefresh(refresh,paused);
 target.dispatchEvent(new Event('forgelex:case-access-revoked'));target.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(90000);
 expect(refresh).not.toHaveBeenCalled();expect(paused).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);stop();
});
