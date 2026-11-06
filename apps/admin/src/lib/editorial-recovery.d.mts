export interface EditorialRecoveryCandidate<T=any> {key:string;content:T;fingerprint:string;baseRevision:number;updatedAt:number}
export function clearEditorialRecovery(storage:Storage,userId:string):void
export function createEditorialRecovery(storage:Storage,identity:{userId:string;siteId:string;entityId:string},writerId:string,now?:()=>number):{
 write(value:{content:unknown;fingerprint:string;baseRevision:number}):boolean
 clear(fingerprint:string):void
 candidates():EditorialRecoveryCandidate[]
 adopt(candidate:EditorialRecoveryCandidate):void
 discard(candidate:EditorialRecoveryCandidate):void
}
