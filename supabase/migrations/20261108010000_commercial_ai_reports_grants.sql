-- IA Comercial · Generador de reportes (lectura).
--
-- El motor de reportes lee con la clave de servicio (filtrando siempre por
--    organización y con los permisos chequeados en el código): sin RLS por fila
--    los reportes de períodos largos no se cortan por tiempo.
GRANT SELECT ON
  public.sales_orders,
  public.sales_order_items,
  public.customers,
  public.products,
  public.categories,
  public.suppliers,
  public.warehouses,
  public.credit_notes,
  public.pos_sales,
  public.receivable_payments,
  public.accounts_receivable,
  public.purchase_orders,
  public.purchase_order_items,
  public.payable_payments,
  public.accounts_payable,
  public.organization_expenses,
  public.expense_categories,
  public.view_stock_detail,
  public.commercial_ai_events
TO service_role;
