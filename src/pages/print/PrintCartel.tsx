// Cartel del libro de quejas para colgar a la vista del cliente
import { useEffect, useState } from "react";
import { appApi } from "../../config";
import "../../r1.css";
import { useLightPage } from "./usePrintPage";

export default function PrintCartel() {
  useLightPage();
  const [company, setCompany] = useState("");
  useEffect(() => { appApi<{ name: string }>("/company").then((c) => setCompany(c.name)).catch(() => {}); }, []);
  return (
    <div className="tn-print">
      <div className="tn-print-bar"><span style={{ color: "#111" }}>Colgalo cerca de la caja o la entrada, a la vista de los clientes.</span><button className="primary-button" onClick={() => window.print()}>Imprimir</button></div>
      <div className="tn-sheet">
        <div className="tn-cartel">
          <h1>LIBRO DE QUEJAS</h1>
          <p><strong>{company}</strong></p>
          <p>Este local cuenta con Libro de Quejas a disposición de los consumidores.</p>
          <p>Pedilo en la caja o al personal.</p>
          <p style={{ fontSize: 14, marginTop: 28 }}>Ley 24.240 de Defensa del Consumidor y normativa local vigente. Documento no válido como factura.</p>
        </div>
      </div>
    </div>
  );
}
