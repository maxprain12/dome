import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import ManysView from './ManysView';
import ManyReview from './ManyReview';
import {manyMarkVariant} from './ManyMark';
import {request,delegateToMany,type ManyDetail} from '@/lib/manys/api';
vi.mock('@/lib/manys/api',()=>({request:vi.fn(),delegateToMany:vi.fn()}));
const detail:ManyDetail={many:{id:'many-test',name:'Research',instructions:'',grant_revision:1,grants:{projects:[],resources:[],capabilities:['vault.read']}},conversations:[{id:'conversation'}],tasks:[],messages:[],actions:[],recurrences:[],conflicts:[],computer:null};
beforeEach(()=>{localStorage.clear();vi.mocked(request).mockImplementation(async path=>path===''?{manys:[detail.many]}:detail);vi.mocked(delegateToMany).mockResolvedValue({id:'task',prompt:'Report',state:'queued',question:null,result:null});});
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
   expect(screen.getByText('Hi').closest('[data-slot="bubble-content"]')).toBeTruthy();
   expect(screen.getByText('Hello from Many').closest('[data-slot="bubble-content"]')).toBeTruthy();
 });
 it('records an uncertain failure with evidence without approving or resending it',async()=>{
   const perform=vi.fn(async fn=>fn());render(<ManyReview detail={{...detail,actions:[{id:'action',digest:'hash',state:'outcome_unknown',expires_at:'',proposal:{operation:'send'},receipt:null}]}} busy={false} perform={perform}/>);
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'Checked destination: no message'}});fireEvent.click(screen.getByRole('button',{name:/Confirm failed|Confirmar fallida/}));
   await waitFor(()=>expect(request).toHaveBeenCalledWith('/many-test/actions/action','PATCH',{outcome:'failed',evidence:'Checked destination: no message'}));
 });
});
