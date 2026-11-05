package com.parkinggack.app

import com.parkinggack.app.car.UxRestriction
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UxRestrictionTest {
    @Test fun parsesFlags() {
        val r = UxRestriction(true, UxRestriction.NO_KEYBOARD or UxRestriction.NO_VIDEO)
        assertTrue(r.isDriving)
        assertTrue(r.noKeyboard)
        assertTrue(r.noVideo)
        assertFalse(r.noSetup)
    }

    @Test fun unknownIsUnrestricted() {
        assertFalse(UxRestriction.UNKNOWN.isDriving)
    }
}
