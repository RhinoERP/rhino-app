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

export function DebitNoteEmail({
  debitNoteNumber,
  bodyText,
  previewText,
}: {
  debitNoteNumber: string;
  bodyText: string;
  previewText: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f4f5",
          fontFamily: "Arial, sans-serif",
          margin: "0",
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: "12px",
            margin: "0 auto",
            maxWidth: "560px",
            padding: "32px",
          }}
        >
          <Heading style={{ color: "#111827", fontSize: "24px" }}>
            Tu nota de débito electrónica ya está lista
          </Heading>
          <Text style={{ color: "#374151", whiteSpace: "pre-line" }}>
            {bodyText}
          </Text>
          <Section
            style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              margin: "24px 0",
              padding: "16px",
            }}
          >
            <Text style={{ color: "#6b7280", fontSize: "12px" }}>
              COMPROBANTE
            </Text>
            <Text>{debitNoteNumber}</Text>
          </Section>
          <Text style={{ color: "#374151" }}>
            Podés responder este correo si necesitás ayuda.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
