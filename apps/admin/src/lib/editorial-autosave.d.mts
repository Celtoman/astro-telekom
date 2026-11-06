export function editorialFingerprint(value: unknown): string
export interface EditorialSaveState { status: 'saved'|'dirty'|'saving'|'error'|'conflict'; revision:number; dirty:boolean; savedAt:number|null; error:unknown; recoveryAvailable:boolean }
export interface EditorialSaved<T> {content:T;revision:number;fingerprint:string}
export class EditorialAutosave<T> {
  constructor(options:{content:T;revision:number;save:(content:T,revision:number,checkpoint:boolean)=>Promise<{content:T;revision:number}>;onState?:(state:EditorialSaveState)=>void;recovery?:{write:(value:any)=>boolean|void;clear:(fingerprint:string)=>void}|null;delay?:number;now?:()=>number})
  readonly state:EditorialSaveState
  readonly revision:number
  latest:T
  change(content:T):void
  flush(checkpoint?:boolean):Promise<EditorialSaved<T>>
  snapshot():EditorialSaved<T>
  resolveConflict(server:{content:T;revision:number},keepLocal:boolean):void
  recover(candidate:{content:T;baseRevision:number}):void
  dispose():void
}
