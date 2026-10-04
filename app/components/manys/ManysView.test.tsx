import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import ManysView from './ManysView';
import ManyComputer from './ManyComputer';
import ManyReview from './ManyReview';
import {manyMarkVariant} from './ManyMark';
import {request,delegateToMany,listCloudProviders,type ManyDetail} from '@/lib/manys/api';
vi.mock('@/lib/manys/api',()=>({request:vi.fn(),delegateToMany:vi.fn(),listCloudProviders:vi.fn()}));
const detail:ManyDetail={many:{id:'many-test',name:'Research',instructions:'',grant_revision:1,grants:{projects:[],resources:[],capabilities:['vault.read']}},conversations:[{id:'conversation'}],tasks:[],messages:[],actions:[],recurrences:[],conflicts:[],computer:null};
beforeEach(()=>{localStorage.clear();vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:detail);vi.mocked(delegateToMany).mockResolvedValue({id:'task',prompt:'Report',state:'queued',question:null,result:null});vi.mocked(listCloudProviders).mockResolvedValue([{id:'openai',name:'OpenAI'}]);});
describe('Many’s durable interaction',()=>{
 it('restores a draft after leaving the view and clears it only after acceptance',async()=>{
   const view=render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));
   const input=await screen.findByLabelText(/Message or task|Mensaje o tarea/);fireEvent.change(input,{target:{value:'Report'}});expect(localStorage.getItem('manys:draft:many-test')).toBe('Report');
   view.unmount();render(<ManysView/>);fireEvent.click(await screen.findByRole('button',{name:'Research'}));expect(await screen.findByLabelText(/Message or task|Mensaje o tarea/)).toHaveValue('Report');
   fireEvent.click(screen.getByRole('button',{name:/Send task|Enviar tarea/}));await waitFor(()=>expect(delegateToMany).toHaveBeenCalledWith('many-test','Report'));await waitFor(()=>expect(localStorage.getItem('manys:draft:many-test')).toBeNull());
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
 it('types into the computer as visible text',()=>{
   render(<ManyComputer manyId="many-test" control="human" live={false}/>);
   const field=screen.getByLabelText(/Type into the browser|Escribir en el navegador|Saisir dans le navigateur|Escrever no navegador/);
   expect(field).toHaveAttribute('type','text');
 });
 it('records an uncertain failure with evidence without approving or resending it',async()=>{
   const perform=vi.fn(async fn=>fn());render(<ManyReview detail={{...detail,actions:[{id:'action',digest:'hash',state:'outcome_unknown',expires_at:'',proposal:{operation:'send'},receipt:null}]}} busy={false} perform={perform}/>);
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'Checked destination: no message'}});fireEvent.click(screen.getByRole('button',{name:/Confirm failed|Confirmar fallida/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/actions/action','PATCH',{outcome:'failed',evidence:'Checked destination: no message'}));
 });
});
