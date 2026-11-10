/* Only an allowlisted operational summary leaves this local converter. */
(function(root){
  'use strict';
  const text=(value,max)=>String(value??'').trim().slice(0,max);
  async function summary({channel,batch,rows,read,shopee,shopeeOrders,pages,total}){
    if(channel==='shopee'&&shopee){const orders=shopeeOrders||root.LocalShopee.orders(shopee);if(!orders.length)throw Error('Nenhum pedido Shopee foi identificado para o histórico.');return {request_id:crypto.randomUUID(),channel,pages,total:shopee.labels.length,included:shopee.labels.length,orders};}
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
  async function compact(results){
    if(!Array.isArray(results)||!results.length||results.length>200)throw Error('Lote compacto inválido para o histórico.');
    const orders=[],seen=new Set();
    for(const result of results){
      const id=result.id;
      if(!/^\d{6}[A-Z0-9]{8}$/.test(id||'')||seen.has(id)||!result.label?.raw||!result.checklist?.raw)throw Error('Pedido compacto sem identificação única e origens válidas.');
      seen.add(id);
      // Hash ORIGINAL label and checklist, never the resized/combined PDF page.
      // These aliases reconcile records previously saved by the normal converter.
      const source_keys=await Promise.all([result.label,result.checklist].map(p=>root.LocalShopee.fingerprint(p)));
      orders.push({key:'shopee:'+id,identified:true,order_ref:id,shipment_ref:'',products:[],source_keys});
    }
    return {request_id:crypto.randomUUID(),channel:'shopee',pages:results.length,total:results.length,included:results.length,orders};
  }
  root.LocalConversionHistory=Object.freeze({summary,compact});
})(globalThis);
