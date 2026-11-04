package com.ila3.dshomni.data.auth

/** One tenant a user belongs to. */
data class TenantRef(val id: String, val name: String, val role: String)

/** A signed-in account: tokens plus the tenant the app is currently in. */
data class AuthSession(
    val baseUrl: String,
    val accessToken: String,
    val refreshToken: String,
    val tenantId: String,
    val role: String,
    val email: String,
    val name: String,
    val tenants: List<TenantRef>,
)

/** Result of a login/register/switch call. */
sealed interface AuthResult {
    data class Success(val session: AuthSession) : AuthResult
    data class Failure(val message: String) : AuthResult
}
