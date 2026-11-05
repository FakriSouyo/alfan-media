DROP TRIGGER order_delete;
CREATE TRIGGER order_delete BEFORE DELETE ON orders BEGIN
  -- Remove outgoing entries first so cancellation returns cannot briefly
  -- drive the balance below zero during per-row ledger triggers.
  DELETE FROM stock_movements WHERE reference=OLD.invoice_no AND type='SALE';
  DELETE FROM stock_movements WHERE reference=OLD.invoice_no AND type IN ('RETURN','CANCELLED_ORDER');
END;
