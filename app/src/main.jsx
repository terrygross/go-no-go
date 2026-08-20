import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GoNoGo from "./GoNoGo.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoNoGo />
  </StrictMode>
);
