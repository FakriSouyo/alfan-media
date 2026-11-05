-- Triggers run inside the same D1 batch transaction as the command.
CREATE TRIGGER movement_insert AFTER INSERT ON stock_movements BEGIN
  UPDATE products SET stock=coalesce((SELECT sum(quantity) FROM stock_movements WHERE product_id=NEW.product_id),0), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.product_id;
END;
CREATE TRIGGER movement_delete AFTER DELETE ON stock_movements BEGIN
  UPDATE products SET stock=coalesce((SELECT sum(quantity) FROM stock_movements WHERE product_id=OLD.product_id),0), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=OLD.product_id;
END;
CREATE TRIGGER movement_immutable BEFORE UPDATE ON stock_movements BEGIN
  SELECT RAISE(ABORT,'Stock ledger is immutable');
END;
CREATE TRIGGER order_transition BEFORE UPDATE OF status ON orders WHEN NEW.status<>OLD.status BEGIN
  SELECT CASE WHEN NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('CHECKED_OUT','CANCELLED')) OR
    (OLD.status='CHECKED_OUT' AND NEW.status IN ('COMPLETED','CANCELLED'))
  ) THEN RAISE(ABORT,'Invalid order transition') END;
  SELECT CASE WHEN NEW.status IN ('CHECKED_OUT','COMPLETED') AND NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=OLD.id) THEN RAISE(ABORT,'Order has no items') END;
  -- Existing sales must exactly match the aggregate order quantities.
  SELECT CASE WHEN NEW.status IN ('CHECKED_OUT','COMPLETED','CANCELLED')
    AND EXISTS(SELECT 1 FROM stock_movements WHERE reference=OLD.invoice_no AND type='SALE')
    AND EXISTS(
      SELECT product_id, -sum(quantity) AS qty FROM order_items WHERE order_id=OLD.id AND product_id IS NOT NULL GROUP BY product_id
      EXCEPT SELECT product_id,sum(quantity) FROM stock_movements WHERE reference=OLD.invoice_no AND type='SALE' GROUP BY product_id
    ) THEN RAISE(ABORT,'Sale ledger mismatch; reconcile before continuing') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM stock_movements WHERE reference=OLD.invoice_no AND type='SALE') AND EXISTS(
      SELECT product_id,sum(quantity) FROM stock_movements WHERE reference=OLD.invoice_no AND type='SALE' GROUP BY product_id
      EXCEPT SELECT product_id,-sum(quantity) FROM order_items WHERE order_id=OLD.id AND product_id IS NOT NULL GROUP BY product_id
    ) THEN RAISE(ABORT,'Unexpected sale ledger entry') END;
END;
CREATE TRIGGER order_sale AFTER UPDATE OF status ON orders
WHEN NEW.status IN ('CHECKED_OUT','COMPLETED') AND NEW.status<>OLD.status
AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE reference=NEW.invoice_no AND type='SALE') BEGIN
  INSERT INTO stock_movements(product_id,type,quantity,reference,created_by)
    SELECT product_id,'SALE',-sum(quantity),NEW.invoice_no,NEW.created_by FROM order_items WHERE order_id=NEW.id AND product_id IS NOT NULL GROUP BY product_id;
END;
CREATE TRIGGER order_return AFTER UPDATE OF status ON orders
WHEN NEW.status='CANCELLED' AND OLD.status='CHECKED_OUT' BEGIN
  INSERT INTO stock_movements(product_id,type,quantity,reference,created_by)
    SELECT product_id,'RETURN',-sum(quantity),NEW.invoice_no,NEW.created_by FROM stock_movements
    WHERE reference=NEW.invoice_no AND type='SALE' AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE reference=NEW.invoice_no AND type='RETURN') GROUP BY product_id;
END;
CREATE TRIGGER order_delete BEFORE DELETE ON orders BEGIN
  DELETE FROM stock_movements WHERE reference=OLD.invoice_no AND type IN ('SALE','RETURN','CANCELLED_ORDER');
END;
CREATE TRIGGER product_delete BEFORE DELETE ON products
WHEN EXISTS(SELECT 1 FROM order_items WHERE product_id=OLD.id) BEGIN
  SELECT RAISE(ABORT,'Products with sales history cannot be deleted');
END;
