INSERT INTO sales_orders(id,organization_id,source,conversation_id,total_amount)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','WHATSAPP','77777777-7777-4777-8777-777777777777',10);
UPDATE whatsapp_conversations SET current_pre_sale_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id='77777777-7777-4777-8777-777777777777';
