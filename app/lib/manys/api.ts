export interface Grants {projects:string[];resources:string[];capabilities:string[]}
/** How a cloud Many runs. `provider` is a saved provider id, never an API key. Desktop and Companion send the same shape. */
export type ManyCloudRuntime =
  | { source: 'dome_credits' }
  | { source: 'provider_key'; provider: string };
export interface CloudProviderOption { id: string; name: string }
export interface CloudMany {id:string;name:string;instructions:string;grants:Grants;grant_revision:number;runtime?:ManyCloudRuntime}
export interface Task {id:string;prompt:string;state:string;question:string|null;checkpoint?:{reason?:string};result:{text?:string;resources?:string[]}|null}
export interface Action {id:string;digest:string;state:string;expires_at:string;proposal:unknown;receipt:unknown}
export interface ManyDetail {many:CloudMany;conversations:{id:string}[];tasks:Task[];messages:{id:string;role:string;content:string;task_id:string}[];actions:Action[];recurrences:{id:string;prompt:string;next_at:string;interval_seconds:number}[];computer:{control:string}|null;conflicts:{id:string;resource_id:string;title:string|null;current_revision:number;proposal:unknown}[]}
export async function request<T>(path:string,method='GET',body?:Record<string,unknown>):Promise<T> {
  const result=await window.electron.invoke('manys:request',{path,method,body}) as {success:boolean;error?:string;data:T};
  if(!result.success)throw new Error(result.error??'service_unavailable');return result.data;
}
/** Stable id survives a dropped response; retry never creates a second logical task. */
export function prepareSubmission(manyId:string,prompt:string) {
  const key=`manys:pending:${manyId}`;
  let previous:{requestKey:string;prompt:string}|null=null;
  try{previous=JSON.parse(localStorage.getItem(key)??'null');}catch{localStorage.removeItem(key);}
  const submission=previous?.prompt===prompt?previous:{requestKey:crypto.randomUUID(),prompt};
  localStorage.setItem(key,JSON.stringify(submission));return submission;
}
export function clearSubmission(manyId:string) {localStorage.removeItem(`manys:pending:${manyId}`);}
export async function delegateToMany(manyId:string,prompt:string) {
  const task=await request<Task>(`/${manyId}/tasks`,'POST',prepareSubmission(manyId,prompt));clearSubmission(manyId);return task;
}
/** Saved API-key providers whose base URL can run outside this machine. Names only — never keys. */
export async function listCloudProviders(): Promise<CloudProviderOption[]> {
  const result = await window.electron.invoke('manys:cloud-providers') as {
    success: boolean;
    error?: string;
    data?: { providers: CloudProviderOption[] };
  };
  if (!result.success) throw new Error(result.error ?? 'service_unavailable');
  return result.data?.providers ?? [];
}
