import { getManysTransport } from './transport';
export interface ComputerPermissions {browser:boolean;files:boolean;shell:boolean}
export interface Grants {projects:string[];resources:string[];capabilities:string[];computer?:ComputerPermissions;paused?:boolean;memory?:boolean}
/** How a cloud Many runs. `provider` is a saved provider id, never an API key. Desktop and Companion send the same shape. */
export type ManyCloudRuntime =
  | { source: 'dome_credits' }
  | { source: 'provider_key'; provider: string };
export interface CloudProviderOption { id: string; name: string }
export interface CloudMany {id:string;name:string;instructions:string;grants:Grants;grant_revision:number;runtime?:ManyCloudRuntime;model_source?:'dome'|'external'|'local'|null;model_provider?:string|null;model_name?:string|null;model_thinking?:string|null}
export interface Task {id:string;prompt:string;state:string;question:string|null;checkpoint?:{reason?:string;access?:{label:string;hosts:string[]}};result:{text?:string;resources?:string[]}|null}
export interface Action {id:string;digest:string;state:string;expires_at:string;proposal:unknown;receipt:unknown;operation_id?:string|null;task_id?:string|null}
export interface ManyDetail {many:CloudMany;conversations:{id:string}[];tasks:Task[];messages:{id:string;role:string;content:string;task_id:string;created_at?:string}[];actions:Action[];recurrences:{id:string;prompt:string;next_at:string;interval_seconds:number}[];computer:{control:string;last_activity?:string|null}|null;conflicts:{id:string;resource_id:string;title:string|null;current_revision:number;proposal:unknown}[]}
export interface PolicyMatch {tools?:string[];capabilities?:string[];operations?:string[];hosts?:string[]}
export interface Policy {id:string;many_id:string|null;name:string;effect:'allow'|'deny';mode:'enforce'|'observe';enabled:boolean;match:PolicyMatch}
export interface AuditEntry {id:string;sequence:number;phase:'decision'|'result';parent_id:string|null;tool:string;operation:string|null;host:string|null;decision:'allowed'|'denied'|'observed_denied'|null;rule_name:string|null;reason:string|null;outcome:'ok'|'error'|null;error_code:string|null;created_at:string}
export interface Credential {id:string;many_id:string|null;label:string;username:string|null;hosts:string[];created_at:string;last_used_at:string|null}
export function request<T>(path:string,method='GET',body?:Record<string,unknown>):Promise<T> {
  return getManysTransport().request<T>(path,method,body);
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
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface CloudModel { id: string; name: string; input: ('text' | 'image')[]; reasoning: boolean; contextWindow: number | null }
/** A model of the Dome plan, paid with credits. `available` is false when the person's plan does not include it. */
export interface DomeCloudModel extends CloudModel { multiplier: number; minPlan: string; available: boolean }
export interface SavedProviderModels { id: string; name: string; models: CloudModel[]; defaultModel: string | null }
export interface CloudModelCatalog { dome: DomeCloudModel[]; saved: SavedProviderModels[] }
/** What a person picks for a Many. A key is never part of it: the main process adds it on the way out. */
export interface ModelSelection { source: 'dome' | 'external'; provider?: string; model: string; thinking?: ThinkingLevel }

/** The models a Many can run on: the plan's, and those of each saved provider a worker can reach. */
export function listCloudModels(): Promise<CloudModelCatalog> {
  return getManysTransport().listModels();
}

/** Changes the model of one Many. It applies from its next task. */
export function setManyModel(id: string, selection: ModelSelection): Promise<void> {
  return getManysTransport().setModel(id, selection);
}

/** Saved API-key providers whose base URL can run outside this machine. Names only — never keys. */
export function listCloudProviders(): Promise<CloudProviderOption[]> {
  return getManysTransport().listProviders();
}
