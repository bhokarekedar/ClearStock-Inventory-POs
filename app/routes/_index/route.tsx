import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors;

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>ClearStock: Inventory Forecasting & Purchase Orders</h1>
        <p className={styles.text}>
          Automate reorder points, forecast sales velocity across multiple timeframes, and draft supplier purchase orders with sub-second accuracy.
        </p>
        {showForm && (
          <Form className={styles.form} method="post">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>{errors?.shop ?? "e.g: my-shop-domain.myshopify.com"}</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Intelligent Replenishment</strong>. Predict stockout dates and calculate precision reorder points using 7D, 14D, 30D, and 90D velocity windows.
          </li>
          <li>
            <strong>1-Click Purchase Orders</strong>. Automatically draft POs grouped by supplier with custom MOQs, case pack rounding, and vendor lead times.
          </li>
          <li>
            <strong>Multi-Location Stock Receiving</strong>. Commit received inventory directly to Shopify locations with real-time stock-on-hand synchronization.
          </li>
        </ul>
      </div>
    </div>
  );
}
