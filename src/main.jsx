import React from "react";
import ReactDOM from "react-dom/client";
import GoNoGo from "./GoNoGo.jsx";
import AccountGate from "./account/AccountGate.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccountGate>
      <GoNoGo />
    </AccountGate>
  </React.StrictMode>
);
