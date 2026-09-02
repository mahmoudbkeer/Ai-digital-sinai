package com.aidigitalsinai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore(this)
        val api = PlatformApi(BuildConfig.API_BASE_URL, store)
        setContent { MaterialTheme { Surface { LoginScreen(api, store) } } }
    }
}

@androidx.compose.runtime.Composable
private fun LoginScreen(api: PlatformApi, store: SessionStore) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var tenantName by remember { mutableStateOf("") }
    var registerMode by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(PaddingValues(24.dp)),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("AI DIGITAL SINAI", style = MaterialTheme.typography.headlineMedium)
        Text(if (registerMode) "إنشاء مساحة عمل" else "تسجيل الدخول", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(email, { email = it }, label = { Text("البريد الإلكتروني") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("كلمة المرور") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        if (registerMode) {
            OutlinedTextField(displayName, { displayName = it }, label = { Text("الاسم") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(tenantName, { tenantName = it }, label = { Text("اسم النشاط") }, modifier = Modifier.fillMaxWidth())
        }
        Button(
            onClick = {
                loading = true
                message = ""
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        if (registerMode) api.register(email, password, displayName, tenantName)
                        else api.login(email, password)
                    }
                    loading = false
                    message = if (result.status in 200..299) {
                        "نجح الاتصال: HTTP ${result.status}. tenant=${store.tenantId}"
                    } else {
                        "فشل الطلب: HTTP ${result.status} — ${result.body.optString("message", "تعذر الاتصال")}" 
                    }
                }
            },
            enabled = !loading && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { if (loading) CircularProgressIndicator() else Text(if (registerMode) "تسجيل" else "دخول") }
        Button(onClick = { registerMode = !registerMode; message = "" }, modifier = Modifier.fillMaxWidth()) {
            Text(if (registerMode) "لدي حساب بالفعل" else "إنشاء حساب جديد")
        }
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
    }
}
