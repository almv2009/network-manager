import ReactDOM from "react-dom/client";
import { bootstrapRuntime } from "./runtime-entry-enterprise";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

bootstrapRuntime(root);
