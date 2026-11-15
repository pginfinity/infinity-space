import { createRoot } from "react-dom/client";
import "../../../styles.css";
import Gallery from "../Gallery.tsx";

/** Entrada isolada da galeria (não depende do App), para desenvolvimento e screenshots. */
createRoot(document.getElementById("root") as HTMLElement).render(<Gallery />);
