-- Productos no contables: servicios (reseteo, mano de obra) que se venden en cuenta sin descontar existencia.
alter table public.productos
  add column if not exists contable boolean not null default true;

comment on column public.productos.contable is
  'true = controla inventario (existencia). false = solo cobro en cuenta, sin movimiento de stock.';
