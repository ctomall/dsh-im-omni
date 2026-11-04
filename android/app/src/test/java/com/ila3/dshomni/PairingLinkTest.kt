package com.ila3.dshomni

import com.ila3.dshomni.data.model.EntryKind
import com.ila3.dshomni.data.remote.PairingTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pairing input parsing, the one place a wrong guess breaks onboarding. */
class PairingLinkTest {

    @Test
    fun `full pairing link keeps the mount and extracts the code`() {
        val target = PairingTarget.parse("https://harness.ila3.net/phone/pair?code=4KQ2ZT&auto=1")
        assertEquals("https://harness.ila3.net/phone/", target?.baseUrl)
        assertEquals("4KQ2ZT", target?.code)
        assertEquals(EntryKind.PUBLIC, target?.guess)
    }

    @Test
    fun `bare lan host defaults to http with a trailing slash`() {
        val target = PairingTarget.parse("192.168.1.20:8080/phone")
        assertEquals("http://192.168.1.20:8080/phone/", target?.baseUrl)
        assertEquals("", target?.code)
        assertEquals(EntryKind.LAN, target?.guess)
    }

    @Test
    fun `manual code composes a pair url`() {
        val target = PairingTarget.parse("http://10.0.4.7:8080/phone/")
        assertEquals("http://10.0.4.7:8080/phone/pair", target?.pairUrl)
    }

    @Test
    fun `https to a raw ip is a custom entry`() {
        val target = PairingTarget.parse("https://43.162.117.251/phone/")
        assertEquals(EntryKind.CUSTOM, target?.guess)
    }

    @Test
    fun `blank and unsupported input is rejected`() {
        assertNull(PairingTarget.parse(""))
        assertNull(PairingTarget.parse("   "))
    }

    @Test
    fun `normalize base gives a scheme-less address the lan default`() {
        // A bare host is what a LAN entry looks like, so http is the safer guess.
        assertEquals("http://example.com/", PairingTarget.normalizeBase("example.com"))
        assertEquals("https://example.com/", PairingTarget.normalizeBase("https://example.com"))
    }

    @Test
    fun `suggested labels name the entry family`() {
        val lan = PairingTarget.parse("http://192.168.1.20:8080/phone/")
        assertTrue(lan!!.suggestedLabel().startsWith("内网"))
        val public = PairingTarget.parse("https://harness.ila3.net/phone/")
        assertTrue(public!!.suggestedLabel().startsWith("外网"))
    }
}
