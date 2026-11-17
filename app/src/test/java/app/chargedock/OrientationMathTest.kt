package app.chargedock

import org.junit.Assert.assertEquals
import org.junit.Test

class OrientationMathTest {
    @Test
    fun snapsTheSensorAngleToTheNearestQuarterTurn() {
        val expected = mapOf(0 to 0, 44 to 0, 45 to 90, 134 to 90, 135 to 180, 224 to 180, 225 to 270, 314 to 270, 315 to 0, 359 to 0, 360 to 0)
        for ((angle, snapped) in expected) assertEquals("angle $angle", snapped, OrientationMath.snap(angle))
    }

    @Test
    fun upright_phone_in_a_portrait_window_needs_no_turn() {
        assertEquals(0, OrientationMath.contentRotation(displayRotation = 0, deviceAngle = 0))
    }

    @Test
    fun phone_on_its_side_in_a_portrait_window_turns_the_dock_to_landscape() {
        // The window is stuck in portrait (rotation 0) but the phone is turned: the dock must turn the other way.
        assertEquals(-90, OrientationMath.contentRotation(displayRotation = 0, deviceAngle = 90))
        assertEquals(90, OrientationMath.contentRotation(displayRotation = 0, deviceAngle = 270))
    }

    @Test
    fun upside_down_phone_turns_the_dock_all_the_way_round() {
        assertEquals(180, OrientationMath.contentRotation(displayRotation = 0, deviceAngle = 180))
    }

    @Test
    fun when_the_system_already_follows_the_phone_nothing_more_is_needed() {
        assertEquals(0, OrientationMath.contentRotation(displayRotation = 1, deviceAngle = 90))
        assertEquals(0, OrientationMath.contentRotation(displayRotation = 3, deviceAngle = 270))
        assertEquals(0, OrientationMath.contentRotation(displayRotation = 2, deviceAngle = 180))
    }

    @Test
    fun a_landscape_window_with_an_upright_phone_turns_the_dock_back_to_portrait() {
        assertEquals(90, OrientationMath.contentRotation(displayRotation = 1, deviceAngle = 0))
    }

    @Test
    fun results_are_always_one_of_four_turns() {
        for (rotation in 0..3) for (angle in 0..359) {
            assertEquals(true, OrientationMath.contentRotation(rotation, angle) in listOf(-90, 0, 90, 180))
        }
    }
}
