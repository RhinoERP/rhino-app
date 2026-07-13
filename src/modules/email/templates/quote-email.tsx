import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type QuoteEmailProps = {
  customerName: string;
  organizationName: string;
};

export function QuoteEmail({
  customerName,
  organizationName,
}: QuoteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Presupuesto - {organizationName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Presupuesto disponible</Heading>

          <Text style={paragraph}>
            Hola <strong>{customerName}</strong>,
          </Text>

          <Text style={paragraph}>
            Adjuntamos el presupuesto solicitado en PDF. Podés revisar los
            detalles del documento en el archivo adjunto.
          </Text>

          <Section style={noticeBox}>
            <Text style={noticeLabel}>Remitente</Text>
            <Text style={noticeValue}>{organizationName}</Text>
          </Section>

          <Text style={paragraph}>
            Si tenés alguna duda, no dudes en responder este correo.
          </Text>

          <Text style={footer}>{organizationName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f4f4f5",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
  margin: "0",
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
};

const heading = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 24px",
};

const paragraph = {
  color: "#374151",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const noticeBox = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  margin: "24px 0",
  padding: "16px 18px",
};

const noticeLabel = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "0 0 4px",
  textTransform: "uppercase" as const,
};

const noticeValue = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0",
};

const footer = {
  color: "#6b7280",
  fontSize: "13px",
  margin: "24px 0 0",
};
