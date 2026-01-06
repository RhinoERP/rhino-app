/**
 * Monthly Report Email Template
 * Executive summary of Torre de Control metrics
 */

import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

type TopPerformer = {
  name: string;
  value: number;
};

type MonthlyReportEmailProps = {
  organizationName: string;
  monthName: string;
  year: number;
  // Financial metrics
  totalBilled: number;
  totalCollected: number;
  pendingCollection: number;
  // Top performers
  topClients: TopPerformer[];
  topProducts: TopPerformer[];
  // Operational alerts
  outOfStockCount: number;
  delayedOrdersCount: number;
  lowStockCount: number;
};

export function MonthlyReportEmail({
  organizationName,
  monthName,
  year,
  totalBilled,
  totalCollected,
  pendingCollection,
  topClients,
  topProducts,
  outOfStockCount,
  delayedOrdersCount,
  lowStockCount,
}: MonthlyReportEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Reporte Mensual de ${monthName} ${year} - ${organizationName}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Heading style={h1}>
            Reporte Mensual - {monthName} {year}
          </Heading>
          <Text style={subtitle}>{organizationName}</Text>

          {/* Financial Section */}
          <Section style={section}>
            <Heading style={h2}>📊 Resumen Financiero</Heading>
            <table style={table}>
              <tbody>
                <tr>
                  <td style={tableCell}>
                    <Text style={tableLabel}>Total Facturado</Text>
                    <Text style={tableValue}>
                      {formatCurrency(totalBilled)}
                    </Text>
                  </td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <Text style={tableLabel}>Total Cobrado</Text>
                    <Text style={tableValue}>
                      {formatCurrency(totalCollected)}
                    </Text>
                  </td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <Text style={tableLabel}>Pendiente de Cobro</Text>
                    <Text style={tableValueWarning}>
                      {formatCurrency(pendingCollection)}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Top Performers Section */}
          <Section style={section}>
            <Heading style={h2}>🏆 Top Performers</Heading>

            <Row style={row}>
              <Column style={column}>
                <Text style={h3}>Top 5 Clientes</Text>
                <table style={table}>
                  <tbody>
                    {topClients.map((client, index) => (
                      <tr key={client.name}>
                        <td style={topItemCell}>
                          <Text style={topItemRank}>{index + 1}.</Text>
                          <Text style={topItemName}>{client.name}</Text>
                          <Text style={topItemValue}>
                            {formatCurrency(client.value)}
                          </Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Column>

              <Column style={column}>
                <Text style={h3}>Top 5 Productos</Text>
                <table style={table}>
                  <tbody>
                    {topProducts.map((product, index) => (
                      <tr key={product.name}>
                        <td style={topItemCell}>
                          <Text style={topItemRank}>{index + 1}.</Text>
                          <Text style={topItemName}>{product.name}</Text>
                          <Text style={topItemValue}>
                            {formatCurrency(product.value)}
                          </Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Column>
            </Row>
          </Section>

          {/* Operational Alerts Section */}
          <Section style={section}>
            <Heading style={h2}>⚠️ Alertas Operativas</Heading>
            <table style={table}>
              <tbody>
                <tr>
                  <td style={alertCell}>
                    <Text style={alertLabel}>Productos sin Stock</Text>
                    <Text style={alertValue}>{outOfStockCount}</Text>
                  </td>
                </tr>
                <tr>
                  <td style={alertCell}>
                    <Text style={alertLabel}>Pedidos Demorados</Text>
                    <Text style={alertValue}>{delayedOrdersCount}</Text>
                  </td>
                </tr>
                <tr>
                  <td style={alertCell}>
                    <Text style={alertLabel}>Stock Bajo</Text>
                    <Text style={alertValue}>{lowStockCount}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Footer */}
          <Text style={footer}>
            Este es un reporte automático generado por Rhino. Para ver más
            detalles, ingresa a la Torre de Control.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Helper function for currency formatting
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
  backgroundColor: "#ffffff",
};

const h1 = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "0 0 8px 0",
  padding: "0",
};

const subtitle = {
  color: "#666666",
  fontSize: "16px",
  margin: "0 0 32px 0",
};

const h2 = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: "600",
  margin: "32px 0 16px 0",
  padding: "0",
  borderBottom: "2px solid #e5e7eb",
  paddingBottom: "8px",
};

const h3 = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 12px 0",
};

const section = {
  marginBottom: "24px",
};

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const tableCell = {
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
};

const tableLabel = {
  color: "#666666",
  fontSize: "14px",
  margin: "0 0 4px 0",
};

const tableValue = {
  color: "#1a1a1a",
  fontSize: "20px",
  fontWeight: "600",
  margin: "0",
};

const tableValueWarning = {
  color: "#dc2626",
  fontSize: "20px",
  fontWeight: "600",
  margin: "0",
};

const row = {
  display: "flex",
  gap: "16px",
};

const column = {
  flex: "1",
};

const topItemCell = {
  padding: "8px 0",
  borderBottom: "1px solid #f3f4f6",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const topItemRank = {
  color: "#9ca3af",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  width: "20px",
};

const topItemName = {
  color: "#1a1a1a",
  fontSize: "14px",
  margin: "0",
  flex: "1",
};

const topItemValue = {
  color: "#059669",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  textAlign: "right" as const,
};

const alertCell = {
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const alertLabel = {
  color: "#1a1a1a",
  fontSize: "14px",
  margin: "0",
};

const alertValue = {
  color: "#dc2626",
  fontSize: "18px",
  fontWeight: "600",
  margin: "0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "32px 0 0 0",
  textAlign: "center" as const,
  lineHeight: "1.5",
};
