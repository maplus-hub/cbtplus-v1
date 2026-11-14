import type {ReactNode} from 'react';

type Option={value:string;label:string};
type Extra={label:string;value:string;onChange:(value:string)=>void;options:Option[]};
type Props={title:string;count:number;total:number;search:string;onSearch:(value:string)=>void;sort:string;onSort:(value:string)=>void;sortOptions:Option[];filters?:Extra[];children?:ReactNode};

/** Toolbar non-destruktif untuk daftar CBTPlus; semua penyaringan dilakukan di memori. */
export default function ListToolbar({title,count,total,search,onSearch,sort,onSort,sortOptions,filters=[],children}:Props){
 return <div className="cbt-list-toolbar" role="search" aria-label={`Pencarian dan pengurutan ${title}`}>
  <div className="cbt-list-toolbar-head"><strong>{title}</strong><span aria-live="polite">{count} dari {total} data</span></div>
  <div className="cbt-list-toolbar-fields">
   <label>Cari<input aria-label={`Cari ${title}`} value={search} onChange={e=>onSearch(e.target.value)} placeholder="Cari nama, kode, atau keterangan..."/></label>
   {filters.map(f=><label key={f.label}>{f.label}<select aria-label={f.label} value={f.value} onChange={e=>f.onChange(e.target.value)}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}
   <label>Urutkan<select aria-label={`Urutkan ${title}`} value={sort} onChange={e=>onSort(e.target.value)}>{sortOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
   <button type="button" className="outlinebutton" onClick={()=>{onSearch('');onSort(sortOptions[0]?.value||'');for(const f of filters)f.onChange('')}}>Reset filter</button>
  </div>
  {children}
 </div>
}
