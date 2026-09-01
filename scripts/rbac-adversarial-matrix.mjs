#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const port = process.env.RBAC_PORT || "4340"; const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "sinai-rbac-")); const dbPath = join(dir, "rbac.sqlite"); let server; const checks=[];
const roles = { Consumer:"CUSTOMER", Owner:"TENANT_OWNER", Manager:"MANAGER", Employee:"EMPLOYEE", "Service Provider":"SERVICE_PROVIDER", Driver:"DRIVER", Admin:"PLATFORM_ADMIN", "Super Admin":"SUPER_ADMIN" };
const allowed = { Consumer:["READ"], Owner:["READ","CREATE","UPDATE","DELETE","MANAGE","PAY","REFUND"], Manager:["READ","CREATE","DELETE","MANAGE"], Employee:["READ"], "Service Provider":["READ"], Driver:["READ"], Admin:["READ","CREATE","UPDATE","DELETE","MANAGE","PAY","REFUND","ADMIN"], "Super Admin":["READ","CREATE","UPDATE","DELETE","MANAGE","PAY","REFUND","ADMIN"] };
async function call(path, init={}) { return fetch(base+path,{...init,headers:{"content-type":"application/json",...(init.headers||{})}}); }
function note(name, ok, detail) { checks.push({name,status:ok?"PASS":"FAIL",detail}); if(!ok) throw new Error(`${name}: ${detail}`); }
async function wait(){for(let i=0;i<100;i++){try{if((await call("/api/health")).ok)return;}catch{} await new Promise(r=>setTimeout(r,100));}throw Error("server timeout");}
async function register(email,tenantName){const r=await call("/api/platform/auth/register",{method:"POST",body:JSON.stringify({email,password:"secure-password-123",displayName:email,tenantName})});note(`register ${email}`,r.status===201,`HTTP ${r.status}`);return r.json();}
async function login(email){const r=await call("/api/platform/auth/login",{method:"POST",body:JSON.stringify({email,password:"secure-password-123"})});note(`login ${email}`,r.status===200,`HTTP ${r.status}`);return r.json();}
const h=(x,tenant=x.tenantId)=>({authorization:`Bearer ${x.token}`,"x-tenant-id":tenant});
try{
 server=spawn(process.execPath,["dist/index.js"],{cwd:process.cwd(),env:{...process.env,NODE_ENV:"production",ALLOW_SQLITE_PRODUCTION_TEST:"1",SQLITE_PATH:dbPath,COMMAND_CONTEXT_SECRET:"rbac-command",PAYMENT_WEBHOOK_SECRET:"rbac-webhook",CORS_ORIGINS:"http://localhost:3000",PORT:port},stdio:"ignore"}); await wait();
 const a=await register(`rbac-a-${Date.now()}@example.com`,`RBAC Tenant A`); const b=await register(`rbac-b-${Date.now()}@example.com`,`RBAC Tenant B`);
 const db=new DatabaseSync(dbPath); const roleUsers={};
 for(const [label,role] of Object.entries(roles)){const email=`rbac-${role.toLowerCase()}-${Date.now()}@example.com`; const u=await register(email,`Role ${label}`); db.prepare("INSERT INTO tenant_members (tenant_id,user_id,role,permissions_json,created_at) VALUES (?,?,?,?,?)").run(a.tenantId,u.userId,role,"[]",Date.now()); roleUsers[label]={...(await login(email)),userId:u.userId,tenantId:a.tenantId}; }
 const hb=h(b); const product=await call("/api/platform/products",{method:"POST",headers:hb,body:JSON.stringify({businessId:b.businessId,sku:`B-${Date.now()}`,name:"Tenant B Product",priceCents:500})}); note("create Tenant B product",product.status===201,`HTTP ${product.status}`); const p=await product.json();
 await call("/api/platform/inventory/movements",{method:"POST",headers:hb,body:JSON.stringify({branchId:b.branchId,productId:p.productId,quantityDelta:3,reason:"rbac",idempotencyKey:`rbac-stock-${Date.now()}`})});
 const or=await call("/api/platform/orders",{method:"POST",headers:hb,body:JSON.stringify({businessId:b.businessId,branchId:b.branchId,items:[{productId:p.productId,quantity:1}]})}); note("create Tenant B order",or.status===201,`HTTP ${or.status}`); const o=await or.json();
 const inv=await call("/api/platform/invoices",{method:"POST",headers:hb,body:JSON.stringify({orderId:o.orderId})}); note("create Tenant B invoice",[200,201].includes(inv.status),`HTTP ${inv.status}`); const i=await inv.json();
 const pay=await call("/api/platform/payment-intents",{method:"POST",headers:hb,body:JSON.stringify({orderId:o.orderId,amountCents:500,provider:"paymob",idempotencyKey:`rbac-pay-${Date.now()}`})}); note("create Tenant B payment intent",pay.status===201,`HTTP ${pay.status}`); const py=await pay.json();
 const customer=await call("/api/platform/customers",{method:"POST",headers:hb,body:JSON.stringify({name:"Tenant B Customer",email:"b-customer@example.com"})}); note("create Tenant B customer",customer.status===201,`HTTP ${customer.status}`); const c=await customer.json();
 const resources=[
  ["product",`/api/platform/products`,"GET",{}],
  ["order",`/api/platform/orders/${o.orderId}/state`,"PATCH",{state:"PROCESSING"}],
  ["invoice",`/api/platform/invoices`,"GET",{}],
  ["payment_intent",`/api/platform/payment-intents`,"POST",{orderId:o.orderId,amountCents:500,provider:"paymob",idempotencyKey:`idor-pay-${Date.now()}`}],
  ["customer",`/api/platform/customers/${c.customerId}/history`,"GET",{}]
 ];
 for(const [name,path,method,body] of resources){const r=await call(path,{method,headers:h(a,b.tenantId),body:method==="GET"?undefined:JSON.stringify(body)}); note(`cross-tenant IDOR ${name}`,r.status===403,`HTTP ${r.status}, resource IDs from Tenant B`);}
 const calls={READ:["/api/platform/orders","GET",{}],CREATE:["/api/platform/products","POST",{businessId:a.businessId,sku:`M-${Date.now()}`,name:"Matrix Product",priceCents:100}],UPDATE:["/api/platform/configuration","PATCH",{businessName:"Matrix"}],DELETE:["/api/platform/marketplace/favorites","DELETE",{productId:p.productId}],MANAGE:["/api/platform/employees","POST",{userId:"nonexistent-user",role:"EMPLOYEE"}],PAY:["/api/platform/payment-intents","POST",{amountCents:100,provider:"paymob",idempotencyKey:`matrix-pay-${Date.now()}`}],REFUND:["/api/platform/refunds","POST",{orderId:o.orderId,amountCents:100,reason:"matrix",idempotencyKey:`matrix-refund-${Date.now()}`}],ADMIN:["/api/platform/admin/users","GET",{}]};
 for(const [label] of Object.entries(roles)){const x=roleUsers[label]; for(const op of Object.keys(calls)){const [path,method,body]=calls[op]; const r=await call(path,{method,headers:h(x),body:method==="GET"||method==="HEAD"?undefined:JSON.stringify(body)}); const expect=allowed[label].includes(op); const actual=r.status!==403; note(`role=${label} operation=${op}`,actual===expect,`Expected ${expect?"ALLOW":"DENY"}, Actual HTTP ${r.status}`); }}
 console.log(JSON.stringify({status:"PASS",matrix:{roles:Object.keys(roles),operations:Object.keys(calls),checks},crossTenantResources:["product","order","invoice","payment_intent","customer"]}));
}catch(e){console.error(JSON.stringify({status:"FAILED",checks,error:e instanceof Error?e.message:String(e)}));process.exitCode=1;}finally{server?.kill("SIGTERM");try{rmSync(dir,{recursive:true,force:true});}catch{}}
