/* Only an allowlisted operational summary leaves this local converter. */
(function(root){
  'use strict';
  const text=(value,max)=>String(value??'').trim().slice(0,max);
  async function summary({channel,batch,rows,read,pages,total}){
    const orders=[];
    for(let index=0;index<batch.length;index++){
      const label=batch[index],row=rows?.find(r=>r.labelIndex===index),identity=root.LocalInvoices.labelIdentity(label);
      const identified=channel==='mercado-livre'&&/^\d{8,20}$/.test(identity.shipmentId||'');
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',label.raw)),x=>x.toString(16).padStart(2,'0')).join('');
      const group=row?.order&&read?.sales?.groups.find(g=>g.id===row.order.id&&g.shipmentId===row.shipmentId);
      // Listing IDs and product quantities come only from the matched Excel order.
      // DANFE-only/image labels are retained without inventing a product catalog.
      const products=(group?.products||[]).map(p=>({listing_id:text(p.itemId,40),sku:text(p.sku,120),title:text(p.title,500),variation:text(p.variation,500),quantity:p.quantity}));
      orders.push({key:identified?'shipment:'+identity.shipmentId:'label:'+label.width+'x'+label.height+':'+fingerprint,
        identified,order_ref:identified?text(row?.order?.id||identity.saleId,40):'',shipment_ref:identified?identity.shipmentId:'',products});
    }
    return {request_id:crypto.randomUUID(),channel,pages,total,included:batch.length,orders:[...new Map(orders.map(o=>[o.key,o])).values()]};
  }
  root.LocalConversionHistory=Object.freeze({summary});
})(globalThis);
