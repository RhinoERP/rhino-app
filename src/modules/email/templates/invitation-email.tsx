import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type InvitationEmailProps = {
  organizationName: string;
  invitationUrl: string;
  invitationCode?: string;
};

export function InvitationEmail({
  organizationName,
  invitationUrl,
  invitationCode,
}: InvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Invitación para unirte a {organizationName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Invitación a {organizationName}</Heading>
          <Text style={text}>
            Has sido invitado a unirte a <strong>{organizationName}</strong> en
            Rhinos.
          </Text>
          {invitationCode && (
            <Section style={codeSection}>
              <Text style={codeLabel}>Código de invitación:</Text>
              <Text style={code}>{invitationCode}</Text>
            </Section>
          )}
          <Section style={buttonContainer}>
            <Button href={invitationUrl} style={button}>
              Aceptar invitación
            </Button>
          </Section>
          <Text style={text}>O copia y pega este enlace en tu navegador:</Text>
          <Link href={invitationUrl} style={link}>
            {invitationUrl}
          </Link>
          <Text style={footer}>
            Si no solicitaste esta invitación, puedes ignorar este email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
};

const codeSection = {
  backgroundColor: "#f4f4f4",
  borderRadius: "4px",
  padding: "16px",
  margin: "24px 0",
};

const codeLabel = {
  color: "#666",
  fontSize: "14px",
  margin: "0 0 8px 0",
};

const code = {
  color: "#333",
  fontSize: "20px",
  fontWeight: "bold",
  fontFamily: "monospace",
  letterSpacing: "2px",
  margin: "0",
};

const buttonContainer = {
  margin: "32px 0",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "4px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
};

const link = {
  color: "#000000",
  fontSize: "14px",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};

const footer = {
  color: "#898989",
  fontSize: "12px",
  lineHeight: "22px",
  marginTop: "32px",
  textAlign: "center" as const,
};
