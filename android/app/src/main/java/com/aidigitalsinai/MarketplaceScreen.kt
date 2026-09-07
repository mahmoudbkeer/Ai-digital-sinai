package com.aidigitalsinai

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Calendar

private val MarketplaceCategories = listOf("الكل", "الصحة والطب", "المقاولات والحرف", "التعليم والتدريب", "المطاعم والأغذية", "السيارات", "الخدمات الرقمية", "الأزياء والجمال", "النقل والمواصلات", "خدمات أخرى")
private const val MarketplaceContact = "201014732300"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketplaceScreen(api: PlatformApi, notice: String = "", onProtectedAction: (String) -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("الكل") }
    var businesses by remember { mutableStateOf(emptyList<MarketplaceBusiness>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var assistantOpen by remember { mutableStateOf(false) }
    var assistantQuery by remember { mutableStateOf("") }
    var assistantResults by remember { mutableStateOf(emptyList<MarketplaceBusiness>()) }
    var assistantMessage by remember { mutableStateOf("") }
    var subscribed by remember { mutableStateOf(false) }
    var contactName by remember { mutableStateOf("") }
    var contactPhone by remember { mutableStateOf("") }

    fun loadDirectory(search: String = query, selected: String = category) {
        scope.launch {
            loading = true
            error = ""
            val result = withContext(Dispatchers.IO) { api.marketplaceDirectory(search, selected.takeUnless { it == "الكل" } ?: "") }
            businesses = result.second
            loading = false
            if (result.first.status !in 200..299) error = "تعذر تحميل بيانات السوق من قاعدة البيانات."
        }
    }

    LaunchedEffect(category, query) { loadDirectory() }

    fun openExternal(uri: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri))) }
    }

    fun share(business: MarketplaceBusiness) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "${business.name}\n${business.description.ifBlank { business.offeringName }}")
        }
        context.startActivity(Intent.createChooser(intent, "مشاركة ${business.name}"))
    }

    fun runAssistant() {
        val request = assistantQuery.trim()
        if (request.isBlank()) { assistantMessage = "اكتب ما تريد الوصول إليه داخل Marketplace."; return }
        scope.launch {
            assistantMessage = "جارٍ البحث في Marketplace…"
            val result = withContext(Dispatchers.IO) { api.marketplaceDirectory(request) }
            assistantResults = result.second
            assistantMessage = if (result.second.isEmpty()) "لم أجد نشاطًا مطابقًا، جرّب كلمات أخرى." else "وجدت ${result.second.size} نتيجة مطابقة لبحثك."
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 16.dp, bottom = 32.dp)) {
        if (notice.isNotBlank()) item { Text(notice, color = Color(0xFF0D7C86), fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) }
        item {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("AI DIGITAL SINAI", color = Color(0xFF0D7C86), fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                    Text("NOCTURNE SIGNAL", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("بوابتك الرقمية الذكية لخدماتك وإدارة نشاطك", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.LocationOn, null, tint = Color(0xFF0D7C86), modifier = Modifier.size(18.dp)); Text("العريش", fontWeight = FontWeight.SemiBold) }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { onProtectedAction("profile") }) { Text("الملف الشخصي") }
                        TextButton(onClick = { onProtectedAction("orders") }) { Text("طلباتي") }
                    }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF102C3A))) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("خدمة 24 ساعة", color = Color(0xFF62E6D6), style = MaterialTheme.typography.labelMedium)
                    Text("تواصل مع فريق AI Digital Sinai", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("استفسار عن الانضمام كصاحب نشاط أو اقتراح لتطوير المنصة؟", color = Color(0xFFD4E8EA))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { openExternal("tel:+$MarketplaceContact") }) { Icon(Icons.Default.Call, null); Spacer(Modifier.width(6.dp)); Text("اتصال") }
                        OutlinedButton(onClick = { openExternal("https://wa.me/$MarketplaceContact") }) { Text("واتساب") }
                        OutlinedButton(onClick = { onProtectedAction("add_business") }) { Text("أضف نشاطك مجانًا") }
                        IconButton(onClick = { assistantOpen = true }) { Icon(Icons.Default.Search, "المساعد الذكي", tint = Color.White) }
                    }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("مساحة العروض الحصرية", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    val featured = businesses.firstOrNull { it.sponsored } ?: businesses.firstOrNull()
                    if (featured == null) Text("تظهر هنا الأنشطة والعروض الجديدة تلقائيًا عند اعتمادها.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else {
                        Text(featured.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(featured.offeringName.ifBlank { featured.subcategory }, color = Color(0xFF0D7C86))
                        Text(featured.description.ifBlank { "نشاط معتمد داخل Marketplace." }, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(if (featured.sponsored) "إعلان ممول من Advertising · ${featured.district} · ${featured.tag}" else "الأحدث إضافة · ${featured.district} · ${featured.tag}", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        item {
            Card {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("وصّل لك الجديد أولًا", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("سجّل الاسم ورقم التواصل لتلقي العروض والأنشطة الجديدة عند اعتمادها.", style = MaterialTheme.typography.bodySmall)
                    if (subscribed) Text("تم تفعيل استقبال العروض", color = Color(0xFF0D7C86), fontWeight = FontWeight.Bold)
                    else {
                        OutlinedTextField(contactName, { contactName = it }, label = { Text("الاسم بالكامل") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(contactPhone, { contactPhone = it }, label = { Text("رقم التواصل") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Button(onClick = { if (contactName.isNotBlank() && contactPhone.isNotBlank()) subscribed = true }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Send, null); Spacer(Modifier.width(6.dp)); Text("تفعيل التنبيهات") }
                    }
                }
            }
        }
        item {
            Text("استكشف خدماتك بذكاء", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("تصنيفات واضحة للوصول إلى الأنشطة والخدمات المعتمدة بسرعة.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(query, { query = it }, leadingIcon = { Icon(Icons.Default.Search, null) }, label = { Text("ابحث عن نشاط أو خدمة أو حي") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MarketplaceCategories.forEach { item -> FilterChip(selected = category == item, onClick = { category = item }, label = { Text(item) }) }
            }
        }
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("منشآت وخدمات حولك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("${businesses.size} ظاهرة", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (loading) item { Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) { Text("جارٍ تحميل الأنشطة المعتمدة…") } }
        if (error.isNotBlank()) item { Text(error, color = MaterialTheme.colorScheme.error) }
        items(businesses, key = { it.id }) { business -> BusinessCard(business, ::openExternal, ::share, onProtectedAction) }
        if (!loading && businesses.isEmpty() && error.isBlank()) item { Text("لا توجد منشآت أو خدمات معتمدة لهذا البحث.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }

    if (assistantOpen) {
        ModalBottomSheet(onDismissRequest = { assistantOpen = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Text("المساعد الذكي", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); IconButton(onClick = { assistantOpen = false }) { Icon(Icons.Default.Close, "إغلاق") } }
                Text("اكتب طلبك وسأبحث في الأنشطة والخدمات المنشورة فعليًا.")
                OutlinedTextField(assistantQuery, { assistantQuery = it }, label = { Text("مثال: صيدلية أو مطعم") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(onClick = ::runAssistant, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Search, null); Spacer(Modifier.width(6.dp)); Text("ابحث في Marketplace") }
                if (assistantMessage.isNotBlank()) Text(assistantMessage, color = Color(0xFF0D7C86))
                assistantResults.take(5).forEach { result -> Card(onClick = { assistantOpen = false }, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) { Text(result.name, fontWeight = FontWeight.Bold); Text("${result.offeringName} · ${result.district}", style = MaterialTheme.typography.labelMedium); Text(result.description.ifBlank { "خدمة منشورة في Marketplace." }, maxLines = 2, overflow = TextOverflow.Ellipsis) } } }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun BusinessCard(business: MarketplaceBusiness, openExternal: (String) -> Unit, share: (MarketplaceBusiness) -> Unit, onProtectedAction: (String) -> Unit) {
    val open = isBusinessOpenNative(business.hoursJson)
    Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Column {
            Box(modifier = Modifier.fillMaxWidth().height(112.dp).background(Brush.linearGradient(listOf(Color(0xFF12384A), Color(0xFF0D7C86)))), contentAlignment = Alignment.BottomStart) {
                Column(Modifier.padding(14.dp)) { Text(if (business.sponsored) "مميز · Advertising" else business.subcategory, color = Color.White, style = MaterialTheme.typography.labelMedium); Text(business.name, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            }
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(if (open) "● مفتوح ومتاح الآن" else "مغلق حاليًا", color = if (open) Color(0xFF148A6A) else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium); Text(business.district, style = MaterialTheme.typography.labelMedium) }
                Text("${business.offeringName.ifBlank { business.tag }} · ${formatHoursNative(business.hoursJson)}", style = MaterialTheme.typography.bodySmall)
                Text(business.description.ifBlank { "نشاط معتمد داخل Marketplace." }, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) { Text("${business.reviews} تقييم", style = MaterialTheme.typography.labelSmall); Spacer(Modifier.width(10.dp)); business.rating?.let { Icon(Icons.Default.Star, null, tint = Color(0xFFE3A82B), modifier = Modifier.size(16.dp)); Text(" %.1f".format(it), style = MaterialTheme.typography.labelSmall) }; Spacer(Modifier.weight(1f)); IconButton(onClick = { share(business) }) { Icon(Icons.Default.Share, "مشاركة") } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { business.whatsapp?.let { OutlinedButton(onClick = { openExternal("https://wa.me/$it") }, modifier = Modifier.weight(1f)) { Text("واتساب") } }; business.phone?.let { Button(onClick = { openExternal("tel:+$it") }, modifier = Modifier.weight(1f)) { Icon(Icons.Default.Call, null); Spacer(Modifier.width(4.dp)); Text("اتصال") } } }
                OutlinedButton(onClick = { onProtectedAction("cart:${business.id}") }, modifier = Modifier.fillMaxWidth()) { Text("حجز أو إضافة للسلة") }
            }
        }
    }
}

private fun parseHoursNative(value: String?): Any? = runCatching { value?.let { JSONObject(it) } }.getOrNull()

private fun formatHoursNative(value: String?): String {
    val hours = parseHoursNative(value) as? JSONObject ?: return "الساعات غير مسجلة"
    val day = arrayOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")[Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1]
    val entry = hours.opt(day) ?: hours.opt("daily")
    return when (entry) { is String -> entry; is JSONObject -> "${entry.optString("open")} – ${entry.optString("close")}"; else -> "الساعات غير مسجلة" }
}

private fun isBusinessOpenNative(value: String?): Boolean {
    val hours = parseHoursNative(value) as? JSONObject ?: return false
    val day = arrayOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")[Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1]
    val entry = hours.opt(day) ?: hours.opt("daily")
    if (entry == true || entry == "24h" || entry == "24 ساعة") return true
    val range = entry as? String ?: return false
    val parts = range.replace('–', '-').split('-').map { it.trim() }
    if (parts.size != 2) return false
    fun minutes(raw: String): Int { val p = raw.split(':'); return p[0].toIntOrNull()?.times(60)?.plus(p.getOrNull(1)?.toIntOrNull() ?: 0) ?: -1 }
    val open = minutes(parts[0]); val close = minutes(parts[1]); val now = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) * 60 + Calendar.getInstance().get(Calendar.MINUTE)
    if (open < 0 || close < 0) return false
    return if (close < open) now >= open || now <= close else now in open..close
}
