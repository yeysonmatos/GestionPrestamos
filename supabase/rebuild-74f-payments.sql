-- Rebuild préstamo francés 74f19400: pagos desde cronograma (9 completos + 1 parcial)
INSERT INTO payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, type, payment_date, method, status)
SELECT l.id, i.id, l.client_id, l.user_id, i.amount, i.capital, i.interest, 0, 'installment', CURRENT_DATE, 'cash', 'paid'
FROM loans l
JOIN installments i ON i.loan_id = l.id
WHERE l.id = '74f19400-9d38-4f56-b7d9-3ddb55934694'
  AND i.status = 'paid';

INSERT INTO payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, type, payment_date, method, status)
SELECT l.id, i.id, l.client_id, l.user_id, i.paid_amount, 0, i.paid_amount, 0, 'partial', CURRENT_DATE, 'cash', 'paid'
FROM loans l
JOIN installments i ON i.loan_id = l.id
WHERE l.id = '74f19400-9d38-4f56-b7d9-3ddb55934694'
  AND i.status = 'partial';