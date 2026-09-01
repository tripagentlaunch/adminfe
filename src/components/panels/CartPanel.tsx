"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CartPanel.tsx
 * Ported from web/js/advisor.js: CartPanel (line ~1675).
 *
 * `bare` (2026-08-31): renders just the cart list/empty-state + a small
 * header row, without its own outer Card — for nesting inside another
 * card's content instead of standing as its own separate card. No current
 * call site uses this (WorkbenchTab moved to the Card+readOnly mode below),
 * kept as a option for future reuse.
 *
 * `readOnly` + `title` (2026-08-31, v2 of the WorkbenchTab layout): used as
 * WorkbenchTab's "Summary" card — a read-only, in-order recap of the whole
 * draft, deliberately separate from Itinerary Builder's detail-editing job
 * (see WorkbenchTab's module docblock). `readOnly` hides the per-line
 * remove button and the Clear action; `title` overrides the default
 * "Itinerary Cart" heading — the name is provisional, easy to change again.
 * ===========================================================================*/
import { inr } from "../../services/api";
import { productIcon } from "../../lib/advisorHelpers";
import { Card, Empty, Icon } from "../ui";

function CartBody(props: any) {
  const cart = props.cart;
  return cart.length ? (
    <div className="taw-cart">
      {cart.map((it: any) => (
        <div key={it._cid} className="taw-cart-line">
          <div className="taw-cart-ic">{productIcon(it.type)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="taw-cart-t">{it._title || it.title || it.type}</div>
            <div className="taw-cart-s ta-num">
              {(it._sub || "") + " · net " + inr(it.baseNet) + (it.international ? " · INTL" : "")}
            </div>
          </div>
          {props.readOnly ? null : (
            <button className="taw-cart-x" aria-label="Remove item" title="Remove" onClick={() => props.onRemove(it._cid)}>
              <Icon name="plus" size={15} style={{ transform: "rotate(45deg)" }} />
            </button>
          )}
        </div>
      ))}
    </div>
  ) : (
    <Empty icon={<Icon name="luggage" size={28} />}>
      Add flights, hotels or visas from Itinerary Builder to build the trip.
    </Empty>
  );
}

export function CartPanel(props: any) {
  const cart = props.cart;
  const title = props.title || "Itinerary Cart";

  if (props.bare) {
    return (
      <div className="taw-cart-bare">
        <div className="taw-cart-bare-h">
          <span className="taw-sec-label" style={{ margin: 0 }}>
            {title} {cart.length ? "· " + cart.length + " item" + (cart.length > 1 ? "s" : "") : "· empty"}
          </span>
          {!props.readOnly && cart.length ? (
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={props.onClear}>
              Clear
            </button>
          ) : null}
        </div>
        <CartBody cart={cart} onRemove={props.onRemove} readOnly={props.readOnly} />
      </div>
    );
  }

  return (
    <Card
      title={title}
      icon={<Icon name="luggage" size={18} />}
      sub={cart.length ? cart.length + " item" + (cart.length > 1 ? "s" : "") : "empty"}
      flush
      actions={
        !props.readOnly && cart.length ? (
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={props.onClear}>
            Clear
          </button>
        ) : null
      }
    >
      <CartBody cart={cart} onRemove={props.onRemove} readOnly={props.readOnly} />
    </Card>
  );
}
