import type { CaseMembershipRole } from "../../shared/types";
import { getConfig, hasEnterpriseAuthConfig } from "../_lib/config";
import { audit } from "../_lib/audit";
import { clearCookie, parseCookies } from "../_lib/cookies";
import {
  acceptInvitationByEmailOrToken,
  bindExternalIdentity,
  createInvitedUser,
  ensureCaseMembership,
  findProvisionedUserForIdentity,
  getOrganizationById,
} from "../_lib/db";
import { beginOidcSignIn, consumeOidcCallback } from "../_lib/oidc";
import { errorJson, redirect } from "../_lib/responses";
import { clearSessionCookie, createSession, currentSessionToken, deleteSession, resolveSession } from "../_lib/session";
import type { AppContext } from "../_lib/types";

function authPath(request: Request) {
  return new URL(request.url).pathname.replace(/^\/auth\/?/, "");
}

export const onRequest = async (context: AppContext) => {
  const path = authPath(context.request);
  const config = getConfig(context.env);

  if (path === "sign-in") {
    if (!hasEnterpriseAuthConfig(context.env)) {
      return redirect("/access-denied?reason=auth_not_configured", 302);
    }
    const url = new URL(context.request.url);
    const inviteToken = url.searchParams.get("invite");
    const returnTo = url.searchParams.get("returnTo") || "/app";
    const { authUrl, setCookie } = await beginOidcSignIn(context.env, { returnTo, inviteToken });
    return redirect(authUrl, 302, {
      "set-cookie": setCookie,
    });
  }

  if (path === "callback") {
    if (!hasEnterpriseAuthConfig(context.env)) {
      return redirect("/access-denied?reason=auth_not_configured", 302);
    }
    const callback = await consumeOidcCallback(context.env, context.request);
    if (!callback.ok) {
      return redirect(`/access-denied?reason=${encodeURIComponent(callback.error)}`, 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const subject = callback.identity.subject;
    if (!subject) {
      return redirect("/access-denied?reason=user_not_provisioned", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    let user = await findProvisionedUserForIdentity(context.env.DB, callback.identity.email, subject);
    let organizationId = user?.organizationId || null;

    if (!user) {
      const acceptedInvitation = await acceptInvitationByEmailOrToken(context.env.DB, {
        email: callback.identity.email || "",
        inviteToken: callback.inviteToken,
      });
      if (acceptedInvitation) {
        const createdUser = await createInvitedUser(context.env.DB, {
          organizationId: acceptedInvitation.organizationId,
          email: acceptedInvitation.email,
          displayName: callback.identity.displayName,
          userType: acceptedInvitation.userType,
          externalIdentityId: subject,
        });
        user = createdUser;
        organizationId = acceptedInvitation.organizationId;
        if (acceptedInvitation.caseId && acceptedInvitation.caseRole) {
          await ensureCaseMembership(context.env.DB, {
            caseId: acceptedInvitation.caseId,
            userId: createdUser!.id,
            role: acceptedInvitation.caseRole as CaseMembershipRole,
            invitedBy: acceptedInvitation.invitedBy,
          });
        }
        await audit(context.env.DB, {
          organizationId: acceptedInvitation.organizationId,
          caseId: acceptedInvitation.caseId,
          actorUserId: createdUser?.id || null,
          eventType: "invite_accepted",
          metadata: {
            invitationId: acceptedInvitation.id,
            email: acceptedInvitation.email,
          },
        });
      }
    } else if (!user.externalIdentityId) {
      user = await bindExternalIdentity(context.env.DB, user.id, subject, callback.identity.email);
      organizationId = user?.organizationId || organizationId;
    }

    if (!user || !organizationId) {
      return redirect("/access-denied?reason=user_not_provisioned", 302, {
        "set-cookie": callback.clearCookie,
      });
    }
    if (!user.active) {
      return redirect("/access-denied?reason=inactive_user", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const organization = await getOrganizationById(context.env.DB, organizationId);
    if (!organization) {
      return redirect("/access-denied?reason=organization_membership_required", 302, {
        "set-cookie": callback.clearCookie,
      });
    }

    const session = await createSession(context.env.DB, context.env, {
      userId: user.id,
      organizationId: organization.id,
      oidcSubject: subject,
      oidcEmail: callback.identity.email,
    });

    await audit(context.env.DB, {
      organizationId: organization.id,
      actorUserId: user.id,
      eventType: "sign_in",
      metadata: {
        email: user.email,
        provider: config.oidcProviderName,
      },
    });

    return redirect(callback.returnTo || "/app", 302, {
      "set-cookie": `${callback.clearCookie}, ${session.cookie}`,
    });
  }

  if (path === "sign-out") {
    const rawToken = currentSessionToken(context);
    await deleteSession(context.env.DB, context.env, rawToken);
    return redirect("/sign-in?signedOut=1", 302, {
      "set-cookie": clearSessionCookie(context.env),
    });
  }

  if (path === "session") {
    if (!hasEnterpriseAuthConfig(context.env)) {
      return errorJson(503, "auth_not_configured", "Enterprise sign-in is not configured for this deployment.");
    }
    const session = await resolveSession(context.request, context.env, context.env.DB);
    if (!session) {
      return errorJson(401, "auth_required", "Sign in before accessing Network Manager.");
    }
    if (!session.user.active) {
      return errorJson(403, "inactive_user", "Your account is inactive. Contact your organization administrator.");
    }
    return redirect("/app");
  }

  return errorJson(404, "not_found", "Unknown auth route.");
};
