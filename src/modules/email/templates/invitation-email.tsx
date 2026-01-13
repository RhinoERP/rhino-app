import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type InvitationEmailProps = {
  organizationName: string;
  invitationUrl: string;
  employeeName?: string;
  roleName?: string;
  invitationCode?: string;
};

export function InvitationEmail({
  organizationName,
  invitationUrl,
  employeeName,
  roleName,
  invitationCode,
}: InvitationEmailProps) {
  const displayName = employeeName || "colaborador";

  return (
    <Html>
      <Head />
      <Preview>¡Bienvenido al equipo! Tu acceso a Rhinosapp está listo</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🦏 ¡Bienvenido al equipo!</Heading>
          <Text style={text}>
            Hola <strong>{displayName}</strong>,
          </Text>
          <Text style={text}>
            ¡Es un gusto saludarte! El administrador de{" "}
            <strong>{organizationName}</strong> te ha invitado a formar parte de
            su equipo de trabajo dentro de Rhinosapp.
          </Text>
          {roleName && (
            <Text style={text}>
              A partir de ahora, tendrás acceso a nuestra plataforma con el rol
              de <strong>{roleName}</strong>, lo que te permitirá gestionar
              tareas, optimizar procesos y colaborar en el crecimiento del
              negocio de manera más ágil.
            </Text>
          )}
          <Section style={stepsSection}>
            <Heading style={h2}>🚀 Pasos para empezar:</Heading>
            <Text style={stepText}>
              <strong>1. Activa tu cuenta:</strong> Haz clic en el botón de
              abajo para configurar tu contraseña y confirmar tu ingreso.
            </Text>
            <Text style={stepText}>
              <strong>2. Explora tu panel:</strong> Una vez dentro, verás las
              herramientas habilitadas según tu perfil.
            </Text>
            <Text style={stepText}>
              <strong>3. ¡Manos a la obra!</strong> Ya puedes empezar a cargar
              pedidos, revisar stock o gestionar la tesorería.
            </Text>
          </Section>
          {invitationCode && (
            <Section style={codeSection}>
              <Text style={codeLabel}>Código de invitación:</Text>
              <Text style={code}>{invitationCode}</Text>
            </Section>
          )}
          <Section style={buttonContainer}>
            <Button href={invitationUrl} style={button}>
              Aceptar invitación y configurar cuenta
            </Button>
          </Section>
          <Text style={footer}>
            Si no solicitaste esta invitación, puedes ignorar este email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

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
  margin: "0 0 24px 0",
  padding: "0",
};

const h2 = {
  color: "#333",
  fontSize: "18px",
  fontWeight: "bold",
  margin: "0 0 16px 0",
  padding: "0",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px 0",
};

const stepsSection = {
  backgroundColor: "#f8f9fa",
  borderRadius: "8px",
  padding: "24px",
  margin: "24px 0",
};

const stepText = {
  color: "#333",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px 0",
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
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 28px",
};

const footer = {
  color: "#898989",
  fontSize: "12px",
  lineHeight: "22px",
  marginTop: "32px",
  textAlign: "center" as const,
};
