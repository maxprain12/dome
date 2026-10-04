import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import ManysView from './ManysView';
import ManyComputer from './ManyComputer';
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
   const input=await screen.findByLabelText(/^(Message|Mensaje)$/);fireEvent.change(input,{target:{value:'Report'}});expect(localStorage.getItem('manys:draft:many-test')).toBe('Report');
   view.unmount();render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));expect(await screen.findByLabelText(/^(Message|Mensaje)$/)).toHaveValue('Report');
   fireEvent.click(screen.getByRole('button',{name:/^(Send|Enviar)$/}));await waitFor(()=>expect(delegateToMany).toHaveBeenCalledWith('many-test','Report'));await waitFor(()=>expect(localStorage.getItem('manys:draft:many-test')).toBeNull());
 });
 it('answers the agent question from the same composer instead of starting another task',async()=>{
   const asking={id:'task-q',prompt:'Plan',state:'waiting_input' as const,question:'Which client?',result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:{...detail,tasks:[asking]});
   render(<ManysView/>);
   // Detail load moves this row into the attention group and detaches the button found before that paint.
   expect(await screen.findByText('Which client?')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Research'}));
   fireEvent.change(await screen.findByLabelText(/^(Message|Mensaje)$/),{target:{value:'Acme'}});
   fireEvent.click(screen.getByRole('button',{name:/^(Send|Enviar)$/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/tasks/task-q','PATCH',{action:'answer',answer:'Acme'}));
   expect(delegateToMany).not.toHaveBeenCalled();
 });
 it('shows work in progress as a chat bubble with one stop control and no task rows',async()=>{
   const running={id:'task-r',prompt:'Report',state:'running' as const,question:null,result:null};
   vi.mocked(request).mockImplementation(async (path,method)=>path===''?{manys:[detail.many]}:method==='PATCH'?{}:{...detail,tasks:[running]});
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(await screen.findByRole('status')).toBeInTheDocument();
   expect(screen.queryByRole('button',{name:/Cancel task|Cancelar tarea/})).toBeNull();
   fireEvent.click(screen.getByRole('button',{name:/Stop response|Detener respuesta/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/tasks/task-r','PATCH',{action:'cancel'}));
 });
 it('shows the turn as it happens: the text as it is written and each tool as a card in the thread',async()=>{
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
   const card=screen.getByRole('region',{name:/Searching the web|Buscando en la web|Recherche sur le web|Pesquisando na web/});
   expect(card).toBeInTheDocument();
   expect(card).toHaveTextContent(/Working|En curso|En cours|Em andamento/);
   act(()=>{useLiveRuns.getState().apply({sequence:4,kind:'task_step',task_id:'task-live',many_id:'many-test',data:{callId:'c1',tool:'web_research',operation:'search',host:null,phase:'end',ok:true}});});
   await waitFor(()=>expect(screen.getByRole('region',{name:/Searching the web|Buscando en la web|Recherche sur le web|Pesquisando na web/})).toHaveTextContent(/Done|Hecho|Terminé|Concluído/));
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
 it('names what the Many is doing right now while it works',async()=>{
   const running={id:'task-r',prompt:'Report',state:'running' as const,question:null,result:null};
   vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:path.endsWith('/steps')?{steps:[{sequence:1,task_id:'task-r',data:{tool:'vault_search',operation:null,host:null,phase:'start',ok:null}}]}:{...detail,tasks:[running]});
   render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   expect(await screen.findByText(/Searching the library|Buscando en la biblioteca/)).toBeInTheDocument();
 });
 it('lists collaborators with the Many mark and renders the thread as bubbles',async()=>{
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
   expect(await screen.findByText('Hello from Many')).toBeInTheDocument();
   expect(screen.queryByRole('tab')).toBeNull();
   expect(screen.getByText('Hi').closest('[data-slot="bubble-content"]')).toBeTruthy();
   expect(screen.getByText('Hello from Many').closest('[data-slot="bubble-content"]')).toBeTruthy();
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
 describe('the computer panel',()=>{
   const take=/^(Take control|Tomar el control|Prendre la main|Assumir o controle)$/;
   it('explains who has the computer, waits to start it, and takes control on request',async()=>{
     vi.mocked(request).mockResolvedValue({});
     render(<ManyComputer manyId="many-test" control="agent" live={false}/>);
     expect(screen.getByText(/pauses its task|pausa su tarea|met sa tâche en pause|pausa a tarefa/)).toBeInTheDocument();
     expect(screen.getByRole('button',{name:/^(Show the screen|Ver pantalla|Voir l'écran|Ver a tela)$/})).toBeInTheDocument();
     fireEvent.click(screen.getAllByRole('button',{name:take})[0]);
     await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/computer','POST',{operation:'enter',parameters:{}}));
     expect(await screen.findByRole('button',{name:/^(Hand back control|Devolver el control|Rendre la main|Devolver o controle)$/})).toBeInTheDocument();
   });
   it('hands control back and says the Many will take a fresh capture',async()=>{
     vi.mocked(request).mockResolvedValue({});
     render(<ManyComputer manyId="many-test" control="human" live={false}/>);
     fireEvent.click(screen.getByRole('button',{name:/^(Hand back control|Devolver el control|Rendre la main|Devolver o controle)$/}));
     await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/computer','POST',{operation:'leave',parameters:{}}));
     expect(await screen.findByText(/fresh capture before it continues|captura nueva antes de continuar|nouvelle capture avant de continuer|nova captura antes de continuar/)).toBeInTheDocument();
   });
   it('keeps the terminal for the person who holds the wheel',()=>{
     render(<ManyComputer manyId="many-test" control="agent" live={false}/>);
     fireEvent.mouseDown(screen.getByRole('tab',{name:'Terminal'}));
     fireEvent.click(screen.getByRole('tab',{name:'Terminal'}));
     expect(screen.getByText(/The terminal is yours|El terminal es tuyo|Le terminal est à vous|O terminal é seu/)).toBeInTheDocument();
   });
 });
 it('records an uncertain failure with evidence without approving or resending it',async()=>{
   const perform=vi.fn(async fn=>fn());render(<ManyReview detail={{...detail,actions:[{id:'action',digest:'hash',state:'outcome_unknown',expires_at:'',proposal:{operation:'send'},receipt:null}]}} busy={false} perform={perform}/>);
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'Checked destination: no message'}});fireEvent.click(screen.getByRole('button',{name:/Confirm failed|Confirmar fallida/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/actions/action','PATCH',{outcome:'failed',evidence:'Checked destination: no message'}));
 });
});
