CREATE TABLE payroll_payouts (
  expense_id TEXT PRIMARY KEY REFERENCES expenses(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  gross_tjs DECIMAL(14,2) NOT NULL CHECK (gross_tjs > 0),
  previous_salary_tjs DECIMAL(14,2) NOT NULL,
  paid_advances_tjs DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payroll_payouts_employee_month_idx ON payroll_payouts(employee_id, month);
