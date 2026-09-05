package com.aidigitalsinai

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

sealed interface GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult
    data object RequiresSetup : GoogleSignInResult
    data object Cancelled : GoogleSignInResult
    data class Failed(val message: String) : GoogleSignInResult
}

suspend fun signInWithGoogle(context: Context): GoogleSignInResult {
    val serverClientId = BuildConfig.GOOGLE_SERVER_CLIENT_ID.trim()
    if (serverClientId.isBlank()) return GoogleSignInResult.RequiresSetup
    return try {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
        val result = CredentialManager.create(context).getCredential(context, request)
        val credential = result.credential
        if (credential is androidx.credentials.CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            GoogleSignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            GoogleSignInResult.Failed("لم يتم استلام اعتماد Google صالح.")
        }
    } catch (_: GetCredentialCancellationException) {
        GoogleSignInResult.Cancelled
    } catch (_: GetCredentialException) {
        GoogleSignInResult.Failed("تعذر فتح اختيار حساب Google.")
    } catch (_: Exception) {
        GoogleSignInResult.Failed("تعذر إكمال Google Sign-In.")
    }
}
