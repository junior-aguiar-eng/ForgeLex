import {expect,it} from 'vitest';
import {getDraftPrimaryAction} from './draft-action-model';
it('prioriza edição e conferência atual antes de aprovação ou exportação',()=>{
 const base={exists:true,dirty:false,stale:false,reviewState:'COMPLETE',blockingCount:0,approvalStatus:'DRAFT',readOnly:false};
 expect(getDraftPrimaryAction({...base,dirty:true,approvalStatus:'APPROVED'})).toBe('SAVE_REVIEW');
 expect(getDraftPrimaryAction({...base,stale:true})).toBe('REVIEW');
 expect(getDraftPrimaryAction({...base,reviewState:'INCOMPLETE'})).toBe('REVIEW');
 expect(getDraftPrimaryAction({...base,blockingCount:1})).toBe('REVIEW');
 expect(getDraftPrimaryAction(base)).toBe('APPROVE');
 expect(getDraftPrimaryAction({...base,approvalStatus:'APPROVED'})).toBe('DOWNLOAD');
 expect(getDraftPrimaryAction({...base,readOnly:true})).toBeNull();
});
