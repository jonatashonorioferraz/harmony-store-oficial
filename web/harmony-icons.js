(()=>{
'use strict';

const paths={
  home:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  new:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M12 11v6M9 14h6"/>',
  requests:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10h8M8 14h5M8 18h7"/>',
  products:'<path d="m4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8"/><path d="m8 6 8 4"/>',
  categories:'<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.2"/>',
  team:'<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 11a3 3 0 1 0 0-6M21 20v-2a4 4 0 0 0-3-3.7"/>',
  fields:'<path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h10M18 18h2"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  audit:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  health:'<path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M19 5a5 5 0 0 0-7 0 5 5 0 0 0-7 7l7 8 7-8a5 5 0 0 0 0-7z"/>',
  notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  bills:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  intelligence:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-3M12 16V8M17 16v-6M7 8h2"/>',
  production:'<path d="m4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8"/><path d="m8.5 15 2 2 5-5"/>',
  inventory:'<path d="M3 7h8v6H3zM13 7h8v6h-8zM8 15h8v6H8z"/><path d="M5 7V4h4v3M15 7V4h4v3M10 15v-2h4v2"/>',
  orders:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/><path d="m15 17 1.5 1.5L20 15"/>',
  timeline:'<path d="M6 3v18M6 7h7a3 3 0 0 1 3 3v1M6 17h7a3 3 0 0 0 3-3v-1"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="12" r="2"/>',
  supplies:'<path d="M4 9h16l-1.5 11h-13zM8 9l4-6 4 6"/><path d="M9 13v3M15 13v3"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-1 .6-1.4 1.1-1.4 2.3M12 17h.01"/>',
  shipping:'<path d="M3 6h12v10H3zM15 9h3l3 3v4h-6z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  transfer:'<path d="M4 7h12v9H4zM16 10h3l2 3v3h-5"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7 4h10M14 2l3 2-3 2M17 21H7M10 19l-3 2 3 2"/>',
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/>',
  dashboard:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-3M12 16V8M17 16v-6"/><path d="m16 4 .6 1.4L18 6l-1.4.6L16 8l-.6-1.4L14 6l1.4-.6z"/>',
  shopee:'<path d="M6 8h12l1 13H5zM9 8a3 3 0 0 1 6 0"/><path d="M14.5 12.5c-.5-.4-1.2-.6-2-.6-1.2 0-2 .6-2 1.4 0 2.2 4.5 1 4.5 3.5 0 .9-.9 1.6-2.2 1.6-.9 0-1.8-.3-2.4-.8"/>',
  operation:'<rect x="10" y="3" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/><path d="M12 7v5M5 17v-3h14v3M12 12H5M12 12h7"/>',
  supply:'<path d="m8 12 3 3a2 2 0 0 0 3 0l5-5"/><path d="m3 8 4-4 5 4-5 5zM21 8l-4-4-5 4 5 5zM8 16l2 2M12 17l2 2"/>',
  ideas:'<path d="M9 18h6M10 22h4M8 14a7 7 0 1 1 8 0c-1 .8-1 1.5-1 2H9c0-.5 0-1.2-1-2z"/><path d="m14 11 2-2M10 11l-2-2"/>'
};

const menu={home:'home',new:'new',requests:'requests',products:'products',categories:'categories',team:'team',fields:'fields',audit:'audit',profile:'profile',health:'health',notifications:'notifications',bills:'bills',intelligence:'intelligence',production:'production','production-inventory':'inventory','production-orders':'orders','collaborator-timeline':'timeline','internal-supplies':'supplies',help:'help','shipping-planning':'shipping','transfer-center':'transfer','agenda-harmony':'agenda'};
const intelligence={dashboard:'dashboard',shopee:'shopee',operation:'operation',supply:'supply',ideas:'ideas'};

function svg(name){return `<svg class="harmony-line-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.home}</svg>`}
function setIcon(container,name){if(!container||container.dataset.harmonyIcon===name)return;container.innerHTML=svg(name);container.dataset.harmonyIcon=name}
function normalizeAccountSection(){
  const nav=document.querySelector('.sidebar nav'),profile=nav?.querySelector('[data-view="profile"]');
  if(!nav||!profile)return;
  const account=[...nav.children].find(node=>node.tagName==='SMALL'&&node.textContent.trim().toUpperCase()==='CONTA');
  if(account&&account.nextElementSibling!==profile)nav.insertBefore(account,profile);
}
function apply(){
  normalizeAccountSection();
  document.querySelectorAll('.sidebar .nav[data-view]').forEach(button=>setIcon(button.querySelector(':scope > i'),menu[button.dataset.view]||'home'));
  document.querySelectorAll('.intel-primary-tabs [data-intel-area]').forEach(button=>setIcon(button.querySelector(':scope > i'),intelligence[button.dataset.intelArea]||'dashboard'));
}

apply();
const observer=new MutationObserver(()=>{observer.disconnect();try{apply()}finally{observer.observe(document.body,{childList:true,subtree:true})}});
observer.observe(document.body,{childList:true,subtree:true});
window.HarmonyIcons=Object.freeze({apply});
})();
