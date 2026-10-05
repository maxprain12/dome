import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import ManysView from './ManysView';
import ManyReview from './ManyReview';
import {manyMarkVariant} from './ManyMark';
import {request,delegateToMany,listCloudProviders,type ManyDetail} from '@/lib/manys/api';
import {useLiveRuns} from '@/lib/manys/liveRuns';
vi.mock('@/lib/manys/api',()=>({request:vi.fn(),delegateToMany:vi.fn(),listCloudProviders:vi.fn()}));
const detail:ManyDetail={many:{id:'many-test',name:'Research',instructions:'',grant_revision:1,grants:{projects:[],resources:[],capabilities:['vault.read']}},conversations:[{id:'conversation'}],tasks:[],messages:[],actions:[],recurrences:[],conflicts:[],computer:null};
beforeEach(()=>{localStorage.clear();useLiveRuns.getState().reset();vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:detail);vi.mocked(delegateToMany).mockResolvedValue({id:'task',prompt:'Report',state:'queued',question:null,result:null});vi.mocked(listCloudProviders).mockResolvedValue([{id:'openai',name:'OpenAI'}]);});
describe('Many’s durable interaction',()=>{
 it('restores a draft after leaving the view and clears it only after acceptance',async()=>{
   const view=render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   const input=await screen.findByPlaceholderText(/^(Message|Mensaje)$/);fireEvent.change(input,{target:{value:'Report'}});expect(localStorage.getItem('manys:draft:many-test')).toBe('Report');
   view.unmount();render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));expect(await screen.findByPlaceholderText(/^(Message|Mensaje)$/)).toHaveValue('Report');
   fireEvent.click(screen.getByRole('button',{name:/^(Send|Enviar)$/}));await waitFor(()=>expect(delegateToMany).toHaveBeenCalledWith('many-test','Report'));await waitFor(()=>expect(localStorage.getItem('manys:draft:many-test')).toBeNull());
 });
 it('answers the agent question from the same composer instead of starting another task',async()=>{
   const asking={id:'task-q',prompt:'Plan',state:'waiting_input' as const,question:'Which client?',result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:{...detail,tasks:[asking]});
   render(<ManysView/>);
   // Detail load moves this row into the attention group and detaches the button found before that paint.
   expect(await screen.findByText('Which client?')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Research'}));
   fireEvent.change(await screen.findByPlaceholderText(/Type your answer|Escribe tu respuesta|Écrivez votre réponse|Escreve a tua resposta/),{target:{value:'Acme'}});
   fireEvent.click(screen.getByRole('button',{name:/^(Send|Enviar)$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/tasks/task-q','PATCH',{action:'answer',answer:'Acme'}));
   expect(delegateToMany).not.toHaveBeenCalled();
 });
 it('answers an access request with a private form that stores the sign-in and tells the agent it can go on',async()=>{
   const asking={id:'task-a',prompt:'Open Instagram',state:'waiting_input' as const,question:'Instagram needs a sign-in',checkpoint:{access:{label:'Instagram',hosts:['instagram.com']}},result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:{...detail,tasks:[asking]});
   render(<ManysView/>);
   expect(await screen.findByText('Instagram needs a sign-in')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Research'}));
   const secret=await screen.findByLabelText(/Contraseña|Password|Mot de passe|Senha/);
   expect(secret).toHaveAttribute('type','password');
   fireEvent.change(await screen.findByLabelText(/^(Usuario|Username|Nom d.utilisateur|Utilizador|Usuário)$/),{target:{value:'ana'}});
   fireEvent.change(secret,{target:{value:'hunter2'}});
   fireEvent.click(screen.getByRole('button',{name:/Guardar y continuar|Save and continue|Enregistrer et continuer|Guardar e continuar/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/credentials','POST',{scope:'many',label:'Instagram',username:'ana',secret:'hunter2',hosts:['instagram.com']}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/tasks/task-a','PATCH',expect.objectContaining({action:'answer'})));
   expect(JSON.stringify(vi.mocked(request).mock.calls.filter(call=>String(call[0]).includes('/tasks/')))).not.toContain('hunter2');
 });
 it('shows work in progress with one stop control and no task rows',async()=>{
   const running={id:'task-r',prompt:'Report',state:'running' as const,question:null,result:null};
   vi.mocked(request).mockImplementation(async (path,method)=>path===''?{manys:[detail.many]}:method==='PATCH'?{}:{...detail,tasks:[running]});
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(screen.queryByRole('button',{name:/Cancel task|Cancelar tarea/})).toBeNull();
   fireEvent.click(screen.getByRole('button',{name:/Stop response|Detener respuesta/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/tasks/task-r','PATCH',{action:'cancel'}));
 });
 it('shows the turn as it happens: the text as it is written and each tool inside the reply',async()=>{
   const running={id:'task-live',prompt:'Research',state:'running' as const,question:null,result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:path.endsWith('/steps')?{steps:[]}:{...detail,tasks:[running],messages:[{id:'u1',role:'user',content:'Research the market',task_id:'task-live'}]});
   useLiveRuns.getState().reset();
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(await screen.findByText('Research the market')).toBeInTheDocument();
   act(()=>{
     useLiveRuns.getState().apply({sequence:1,kind:'task_queued',task_id:'task-live',many_id:'many-test',data:{}});
     useLiveRuns.getState().apply({sequence:2,kind:'run_text',task_id:'task-live',many_id:'many-test',data:{messageId:'a',text:'Let me look that up.',end:false}});
     useLiveRuns.getState().apply({sequence:3,kind:'task_step',task_id:'task-live',many_id:'many-test',data:{callId:'c1',tool:'web_research',operation:'search',host:null,phase:'start',ok:null}});
   });
   expect(await screen.findByText('Let me look that up.')).toBeInTheDocument();
   // The tool is part of the reply, drawn as the local Many draws its activity, and shows it is still working.
   await waitFor(()=>expect(document.querySelector('[data-slot="collapsible"][data-kind="search"][data-working="true"]')).toBeTruthy());
   act(()=>{useLiveRuns.getState().apply({sequence:4,kind:'task_step',task_id:'task-live',many_id:'many-test',data:{callId:'c1',tool:'web_research',operation:'search',host:null,phase:'end',ok:true}});});
   await waitFor(()=>expect(document.querySelector('[data-slot="collapsible"][data-kind="search"][data-working="true"]')).toBeNull());
 });
 it('puts a proposal in the thread where it was asked and lists it only once',async()=>{
   const waiting={id:'task-p',prompt:'Send it',state:'waiting_approval' as const,question:null,result:null};
   const proposal={id:'act-9',digest:'e'.repeat(64),state:'pending',expires_at:new Date(Date.now()+3600_000).toISOString(),receipt:null,operation_id:'call-9',task_id:'task-p',proposal:{capability:'external.send',tool:'computer',parameters:{operation:'type',parameters:{text:'ping'}}}};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:path.endsWith('/steps')?{steps:[]}:{...detail,tasks:[waiting],actions:[proposal],messages:[{id:'u9',role:'user',content:'Send it',task_id:'task-p'}]});
   useLiveRuns.getState().reset();
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   // Without the live feed the proposal is still reachable, listed under the thread.
   expect(await screen.findAllByRole('button',{name:/^(Approve|Aprobar|Approuver|Aprovar)$/})).toHaveLength(1);
   act(()=>{
     useLiveRuns.getState().apply({sequence:1,kind:'task_queued',task_id:'task-p',many_id:'many-test',data:{}});
     useLiveRuns.getState().apply({sequence:2,kind:'task_step',task_id:'task-p',many_id:'many-test',data:{callId:'call-9',tool:'propose_action',operation:null,host:null,phase:'start',ok:null}});
   });
   await waitFor(()=>expect(screen.getAllByRole('button',{name:/^(Approve|Aprobar|Approuver|Aprovar)$/})).toHaveLength(1));
 });
 it('pauses a Many from its menu by saving the pause in its grants',async()=>{
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   fireEvent.click(await screen.findByRole('button',{name:/More options|Más opciones|Plus d’options|Mais opções/}));
   fireEvent.click(await screen.findByRole('menuitem',{name:/Pause this Many|Pausar este Many|Mettre ce Many en pause|Pausar este Many/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test','PATCH',expect.objectContaining({grants:expect.objectContaining({paused:true})})));
 });
 it('replaces the composer with an explanation while a Many is paused and resumes it from there',async()=>{
   const pausedMany={...detail.many,grants:{...detail.many.grants,paused:true}};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[pausedMany]}:path.endsWith('/steps')?{steps:[]}:{...detail,many:pausedMany});
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(await screen.findByText(/Many is paused|Many está en pausa|Many est en pause|O Many está em pausa/)).toBeInTheDocument();
   expect(screen.queryByPlaceholderText(/^(Message|Mensaje)$/)).toBeNull();
   fireEvent.click(screen.getByRole('button',{name:/^(Resume|Reanudar|Reprendre|Retomar)$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test','PATCH',expect.objectContaining({grants:expect.objectContaining({paused:false})})));
 });
 it('pauses the whole team from the overview',async()=>{
   render(<ManysView/>);
   fireEvent.click(await screen.findByRole('button',{name:/^(Pause all|Pausar todos|Tout mettre en pause)$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test','PATCH',expect.objectContaining({grants:expect.objectContaining({paused:true})})));
 });
 it('names what the Many is doing right now while it works',async()=>{
   const running={id:'task-r',prompt:'Report',state:'running' as const,question:null,result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:path.endsWith('/steps')?{steps:[{sequence:1,task_id:'task-r',data:{tool:'vault_search',operation:null,host:null,phase:'start',ok:null}}]}:{...detail,tasks:[running]});
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(await screen.findByText(/Searching the library|Buscando en la biblioteca/)).toBeInTheDocument();
 });
 it('lists collaborators with the Many mark and renders the thread',async()=>{
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many,{...detail.many,id:'many-writer',name:'Writer'}]}:{...detail,messages:[{id:'m-assistant',role:'assistant',content:'Hello from Many',task_id:''},{id:'m-user',role:'user',content:'Hi',task_id:''}]});
   render(<ManysView/>);
   const research=await screen.findByRole('button',{name:'Research'});
   const writer=screen.getByRole('button',{name:'Writer'});
   expect(research.querySelector('svg')).toBeTruthy();
   expect(writer.querySelector('svg')).toBeTruthy();
   expect(research.querySelector('svg')?.getAttribute('data-many-mark')).toBe(manyMarkVariant('many-test'));
   expect(writer.querySelector('svg')?.getAttribute('data-many-mark')).toBe(manyMarkVariant('many-writer'));
   expect(manyMarkVariant('many-test')).not.toBe(manyMarkVariant('many-writer'));
   expect(manyMarkVariant('')).toBe('lime');
   fireEvent.click(research);
   // The reply is drawn by the local Many's markdown view, which loads on demand.
   await waitFor(()=>{expect(screen.getByText('Hello from Many')).toBeInTheDocument();expect(screen.getByText('Hi')).toBeInTheDocument();},{timeout:5000});
 });
 it('asks for a saved cloud provider or Dome credits and stores that choice',async()=>{
   vi.mocked(listCloudProviders).mockResolvedValue([{id:'openai',name:'OpenAI'},{id:'anthropic',name:'Anthropic'}]);
   vi.mocked(request).mockImplementation(async (path,method)=>method==='POST'&&path===''?{...detail.many,id:'many-new',name:'Ada',runtime:{source:'provider_key',provider:'anthropic'}}:path===''?{manys:[detail.many]}:detail);
   render(<ManysView/>);
   fireEvent.click((await screen.findAllByRole('button',{name:/New Many|Nuevo Many/}))[0]);
   expect(await screen.findAllByRole('radio')).toHaveLength(2);
   expect(screen.getByRole('radio',{name:/Saved API key|Clave de API guardada/i})).toBeEnabled();
   expect(screen.getByRole('radio',{name:/Dome credits|Créditos de Dome/i})).toBeEnabled();
   expect(screen.queryByText(/sk-/)).toBeNull();
   expect(screen.queryByText('ollama')).toBeNull();
   fireEvent.change(screen.getByLabelText(/Name|Nombre/),{target:{value:'Ada'}});
   fireEvent.click(screen.getByRole('radio',{name:/Dome credits|Créditos de Dome/i}));
   fireEvent.click(screen.getByRole('button',{name:/^Create$|^Crear$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('','POST',{name:'Ada',runtime:{source:'dome_credits'}}));
 });
 it('stores the saved provider by name and refuses to show the key',async()=>{
   render(<ManysView/>);
   fireEvent.click((await screen.findAllByRole('button',{name:/New Many|Nuevo Many/}))[0]);
   fireEvent.change(await screen.findByLabelText(/Name|Nombre/),{target:{value:'Ada'}});
   const saved=await screen.findByRole('radio',{name:/OpenAI/});
   expect(saved).toBeEnabled();
   fireEvent.click(saved);
   fireEvent.click(screen.getByRole('button',{name:/^Create$|^Crear$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('','POST',{name:'Ada',runtime:{source:'provider_key',provider:'openai'}}));
   expect(screen.queryByText(/sk-/)).toBeNull();
 });
 it('retries a template instructions update without creating a second Many',async()=>{
   const created={...detail.many,id:'many-new',name:'Investigación',grants:detail.many.grants};
   vi.mocked(request).mockImplementation(async (path,method)=>{
     if(method==='POST'&&path==='')return created;
     if(method==='PATCH'&&path==='/many-new')throw new Error('service_unavailable');
     return path===''?{manys:[detail.many]}:detail;
   });
   render(<ManysView/>);
   fireEvent.click((await screen.findAllByRole('button',{name:/^Use$|^Usar$/}))[0]);
   fireEvent.click(await screen.findByRole('radio',{name:/Dome credits|Créditos de Dome/i}));
   fireEvent.click(screen.getByRole('button',{name:/^Create$|^Crear$/}));
   expect(await screen.findByText(/^(Could not connect\.|No se pudo conectar\.)$/)).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:/^Create$|^Crear$/}));
   await waitFor(()=>expect(vi.mocked(request).mock.calls.filter(([path,method])=>method==='PATCH'&&path==='/many-new')).toHaveLength(2));
   expect(vi.mocked(request).mock.calls.filter(([path,method])=>method==='POST'&&path==='')).toHaveLength(1);
 });
 it('clears the local draft when delete succeeds',async()=>{
   localStorage.setItem('manys:draft:many-test','Report');
   render(<ManysView/>);
   fireEvent.click((await screen.findAllByRole('button',{name:/Options for Research|Opciones de Research|Options de Research|Opções de Research/}))[0]);
   fireEvent.click(await screen.findByRole('menuitem',{name:/Delete Many|Eliminar Many|Supprimer le Many|Excluir Many/}));
   fireEvent.click(screen.getByRole('button',{name:/^Delete Many$|^Eliminar Many$|^Supprimer le Many$|^Excluir Many$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test','DELETE'));
   await waitFor(()=>expect(localStorage.getItem('manys:draft:many-test')).toBeNull());
 });
 it('records an uncertain failure with evidence without approving or resending it',async()=>{
   const perform=vi.fn(async fn=>fn());render(<ManyReview detail={{...detail,actions:[{id:'action',digest:'hash',state:'outcome_unknown',expires_at:'',proposal:{operation:'send'},receipt:null}]}} busy={false} perform={perform}/>);
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'Checked destination: no message'}});fireEvent.click(screen.getByRole('button',{name:/Confirm failed|Confirmar fallida/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/actions/action','PATCH',{outcome:'failed',evidence:'Checked destination: no message'}));
 });
});
